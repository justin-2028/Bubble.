import 'server-only';

import postgres from 'postgres';
import { svgAvatarDataUrl } from '../avatar';
import { createDefaultExportData, defaultSystemControls } from '../defaultData';
import { cloneExportSchema, normalizeExportSchema } from '../exportSchema';
import {
  PersonImageAsset,
  PersonInteractionDelta,
  RemoteStateDelta,
  isMoreRecentIso,
  sameCalendarDayInTimeZone,
} from '../cloud';
import { Category, ExportSchema, Label, Person, SystemControls } from '../types';
import { uid } from '../utils';
import { isDatabaseConfigured } from './env';
import { HOSTED_TABLES, ensureHostedSchema } from './hostedSchema';
import { StorageConflictError, overwriteJsonDocument, readJsonDocument, writeJsonDocument } from './jsonStore';
import { getPostgresClient } from './postgresClient';

const APP_STATE_KEY = 'state';
const META_STATE_KEY = 'app';
const SYSTEM_CONTROLS_SCOPE = 'default';
type SqlLike = postgres.Sql<any> | postgres.TransactionSql<any>;

export interface AppStateDocument {
  schemaVersion: 1;
  version: number;
  updatedAt: string;
  data: ExportSchema;
}

export type StateVersionSnapshot = {
  version: number;
  updatedAt: string;
};

type CategoryRow = {
  id: string;
  name: string;
  description: string;
  time_limit_value: number;
  time_limit_unit: 'days' | 'months';
  sort_order: number;
  gradient_colors: unknown;
  updated_version: number;
  updated_at: string | Date;
  deleted_at: string | Date | null;
};

type LabelRow = {
  id: string;
  name: string;
  color: string;
  list_order: number;
  updated_version: number;
  updated_at: string | Date;
  deleted_at: string | Date | null;
};

type PersonRow = {
  id: string;
  full_name: string;
  category_id: string;
  context: string;
  last_interaction: string | Date;
  interaction_count: number;
  y_position: number;
  duplicate_group_id: string | null;
  label_ids: unknown;
  starred: boolean;
  archived_at: string | Date | null;
  archived_from_category_id: string | null;
  archived_order: number | null;
  list_order: number;
  content_updated_version: number;
  interaction_updated_version: number;
  image_version: number;
  updated_version: number;
  updated_at: string | Date;
  deleted_at: string | Date | null;
};

type PersonImageRow = {
  id: string;
  image: string;
  updated_version: number;
  updated_at: string | Date;
  deleted_at: string | Date | null;
};

type SystemControlsRow = {
  scope: string;
  multi_select_hotkeys_enabled: boolean;
  multi_select_update_to_now_key: string | null;
  multi_select_archive_key: string | null;
  multi_select_delete_key: string | null;
  updated_version: number;
  updated_at: string | Date;
};

type MetaRow = {
  state_key: string;
  version: number;
  updated_at: string | Date;
  schema_version: number;
};

export async function getAppStateDocument() {
  if (!isDatabaseConfigured()) {
    return legacyGetAppStateDocument();
  }

  const sql = await getHostedSql();
  await ensureNormalizedStateInitialized(sql);
  return readHostedAppStateDocument(sql);
}

export async function getAppStateVersionSnapshot(): Promise<StateVersionSnapshot> {
  if (!isDatabaseConfigured()) {
    const current = await legacyGetAppStateDocument();
    return {
      version: current.doc.version,
      updatedAt: current.doc.updatedAt,
    };
  }

  const sql = await getHostedSql();
  await ensureNormalizedStateInitialized(sql);
  const meta = await readStateMeta(sql);
  return {
    version: meta.version,
    updatedAt: toIsoString(meta.updated_at) ?? new Date().toISOString(),
  };
}

export async function getAppStateDelta(sinceVersion: number): Promise<RemoteStateDelta> {
  if (!isDatabaseConfigured()) {
    const current = await legacyGetAppStateDocument();
    if (sinceVersion >= current.doc.version) {
      return emptyDelta(current.doc.version, current.doc.updatedAt);
    }
    return buildFullDelta(current.doc.data, current.doc.version, current.doc.updatedAt);
  }

  const sql = await getHostedSql();
  await ensureNormalizedStateInitialized(sql);
  const meta = await readStateMeta(sql);
  if (sinceVersion >= meta.version) {
    return emptyDelta(meta.version, toIsoString(meta.updated_at) ?? new Date().toISOString());
  }

  const [categoryRows, labelRows, peopleRows, imageRows, controlsRows] = await Promise.all([
    sql<CategoryRow[]>`
      select *
      from ${sql(HOSTED_TABLES.categories)}
      where updated_version > ${sinceVersion}
      order by sort_order asc, id asc
    `,
    sql<LabelRow[]>`
      select *
      from ${sql(HOSTED_TABLES.labels)}
      where updated_version > ${sinceVersion}
      order by list_order asc, id asc
    `,
    sql<PersonRow[]>`
      select *
      from ${sql(HOSTED_TABLES.people)}
      where updated_version > ${sinceVersion}
      order by list_order asc, id asc
    `,
    sql<PersonImageRow[]>`
      select *
      from ${sql(HOSTED_TABLES.personImages)}
      where updated_version > ${sinceVersion}
      order by id asc
    `,
    sql<SystemControlsRow[]>`
      select *
      from ${sql(HOSTED_TABLES.systemControls)}
      where scope = ${SYSTEM_CONTROLS_SCOPE}
        and updated_version > ${sinceVersion}
      limit 1
    `,
  ]);

  const peopleDelta = splitPeopleDelta(peopleRows, sinceVersion);

  return {
    version: meta.version,
    updatedAt: toIsoString(meta.updated_at) ?? new Date().toISOString(),
    categories: splitCollectionDelta(categoryRows, mapCategoryRow),
    labels: splitCollectionDelta(labelRows, mapLabelRow),
    people: peopleDelta.people,
    personImages: splitCollectionDelta(imageRows, mapPersonImageRow),
    personInteractions: peopleDelta.interactions,
    systemControls: controlsRows[0] ? mapSystemControlsRow(controlsRows[0]) : null,
  };
}

export async function replaceAppState(nextState: ExportSchema, baseVersion: number) {
  if (!isDatabaseConfigured()) {
    return legacyReplaceAppState(nextState, baseVersion);
  }

  const sql = await getHostedSql();
  return sql.begin(async (tx) => {
    await ensureNormalizedStateInitialized(tx);
    const current = await readHostedAppStateDocument(tx);
    if (current.doc.version !== baseVersion) {
      return {
        ok: false as const,
        reason: 'version_mismatch' as const,
        current: current.doc,
      };
    }

    const normalizedNextState = normalizeExportSchema(cloneExportSchema(nextState), current.doc.data);
    if (deepEqual(normalizedNextState, current.doc.data)) {
      return {
        ok: true as const,
        doc: current.doc,
        etag: String(current.doc.version),
      };
    }

    const nextDoc: AppStateDocument = {
      schemaVersion: 1,
      version: current.doc.version + 1,
      updatedAt: new Date().toISOString(),
      data: normalizedNextState,
    };

    await applyFullStateReplacement(tx, current.doc.data, nextDoc.data, nextDoc.version, nextDoc.updatedAt);
    await upsertStateMeta(tx, nextDoc.version, nextDoc.updatedAt);

    return {
      ok: true as const,
      doc: nextDoc,
      etag: String(nextDoc.version),
    };
  });
}

export async function mutateAppState(mutator: (current: ExportSchema) => ExportSchema) {
  if (!isDatabaseConfigured()) {
    return legacyMutateAppState(mutator);
  }

  const sql = await getHostedSql();
  return sql.begin(async (tx) => {
    await ensureNormalizedStateInitialized(tx);
    const current = await readHostedAppStateDocument(tx);
    const currentData = cloneExportSchema(current.doc.data);
    const nextData = normalizeExportSchema(mutator(currentData), current.doc.data);

    if (deepEqual(nextData, current.doc.data)) {
      return current.doc;
    }

    const nextDoc: AppStateDocument = {
      schemaVersion: 1,
      version: current.doc.version + 1,
      updatedAt: new Date().toISOString(),
      data: nextData,
    };

    await applyFullStateReplacement(tx, current.doc.data, nextDoc.data, nextDoc.version, nextDoc.updatedAt);
    await upsertStateMeta(tx, nextDoc.version, nextDoc.updatedAt);
    return nextDoc;
  });
}

export async function createHelperBubble(input: {
  fullName: string;
  categoryId?: string;
  context?: string;
  lastInteraction?: string;
  image?: string;
  starred?: boolean;
}) {
  if (!isDatabaseConfigured()) {
    const fullName = input.fullName.trim();
    const initialLastInteraction = input.lastInteraction ?? new Date().toISOString();
    let createdBubbleId = '';
    let createdBubbleCategoryId = '';
    let createdBubbleImage = '';

    const doc = await legacyMutateAppState((current) => {
      const orderedCategories = current.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      const categoryId =
        input.categoryId && current.categories.some((category) => category.id === input.categoryId)
          ? input.categoryId
          : orderedCategories[0]?.id ?? '';

      if (!categoryId) {
        return current;
      }

      const image = input.image?.trim() ? input.image.trim() : svgAvatarDataUrl(fullName);
      const nextId = uid('p_');

      createdBubbleId = nextId;
      createdBubbleCategoryId = categoryId;
      createdBubbleImage = image;

      return {
        ...current,
        people: [
          ...current.people,
          {
            id: nextId,
            fullName,
            categoryId,
            context: input.context?.trim() ?? '',
            lastInteraction: initialLastInteraction,
            interactionCount: 0,
            image,
            yPosition: 50,
            starred: input.starred ?? false,
            labelIds: [],
          },
        ],
      };
    });

    if (!createdBubbleId) {
      return null;
    }

    return {
      version: doc.version,
      updatedAt: doc.updatedAt,
      bubble: {
        id: createdBubbleId,
        fullName,
        categoryId: createdBubbleCategoryId,
        lastInteraction: initialLastInteraction,
        image: createdBubbleImage,
        starred: input.starred ?? false,
      },
    };
  }

  const fullName = input.fullName.trim();
  const sql = await getHostedSql();
  return sql.begin(async (tx) => {
    await ensureNormalizedStateInitialized(tx);

    const categories = await tx<CategoryRow[]>`
      select *
      from ${tx(HOSTED_TABLES.categories)}
      where deleted_at is null
      order by sort_order asc, id asc
    `;

    const categoryId =
      input.categoryId && categories.some((category) => category.id === input.categoryId)
        ? input.categoryId
        : categories[0]?.id ?? '';

    if (!categoryId) {
      return null;
    }

    const meta = await readStateMeta(tx);
    const nextVersion = meta.version + 1;
    const updatedAt = new Date().toISOString();
    const listOrderRows = await tx<{ next_order: number }[]>`
      select coalesce(max(list_order), -1) + 1 as next_order
      from ${tx(HOSTED_TABLES.people)}
      where deleted_at is null
    `;

    const bubbleId = uid('p_');
    const lastInteraction = input.lastInteraction ?? updatedAt;
    const image = input.image?.trim() ? input.image.trim() : svgAvatarDataUrl(fullName);
    const imageVersion = image ? nextVersion : 0;

    await tx`
      insert into ${tx(HOSTED_TABLES.people)} (
        id,
        full_name,
        category_id,
        context,
        last_interaction,
        interaction_count,
        y_position,
        duplicate_group_id,
        label_ids,
        starred,
        archived_at,
        archived_from_category_id,
        archived_order,
        list_order,
        content_updated_version,
        interaction_updated_version,
        image_version,
        updated_version,
        updated_at,
        deleted_at
      ) values (
        ${bubbleId},
        ${fullName},
        ${categoryId},
        ${input.context?.trim() ?? ''},
        ${lastInteraction},
        ${0},
        ${50},
        ${null},
        ${tx.json([])},
        ${input.starred ?? false},
        ${null},
        ${null},
        ${null},
        ${listOrderRows[0]?.next_order ?? 0},
        ${nextVersion},
        ${nextVersion},
        ${imageVersion},
        ${nextVersion},
        ${updatedAt},
        ${null}
      )
    `;

    if (image) {
      await tx`
        insert into ${tx(HOSTED_TABLES.personImages)} (
          id,
          image,
          updated_version,
          updated_at,
          deleted_at
        ) values (
          ${bubbleId},
          ${image},
          ${nextVersion},
          ${updatedAt},
          ${null}
        )
        on conflict (id) do update
        set image = excluded.image,
            updated_version = excluded.updated_version,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
      `;
    }

    await upsertStateMeta(tx, nextVersion, updatedAt);

    return {
      version: nextVersion,
      updatedAt,
      bubble: {
        id: bubbleId,
        fullName,
        categoryId,
        lastInteraction,
        image,
        starred: input.starred ?? false,
      },
    };
  });
}

export async function applyInteractionUpdate(params: {
  bubbleIds: string[];
  occurredAt: string;
  timeZone: string;
}) {
  if (!isDatabaseConfigured()) {
    let updatedCount = 0;
    const doc = await legacyMutateAppState((current) => {
      const bubbleIdSet = new Set(params.bubbleIds);
      const targetGroupIds = new Set<string>();
      for (const person of current.people) {
        const groupId = person.duplicateGroupId ?? person.id;
        if (bubbleIdSet.has(person.id) || bubbleIdSet.has(groupId)) {
          targetGroupIds.add(groupId);
        }
      }

      return {
        ...current,
        people: current.people.map((person) => {
          const groupId = person.duplicateGroupId ?? person.id;
          if (!targetGroupIds.has(groupId)) return person;
          if (sameCalendarDayInTimeZone(person.lastInteraction, params.occurredAt, params.timeZone)) return person;
          if (!isMoreRecentIso(person.lastInteraction, params.occurredAt)) return person;
          updatedCount += 1;
          return {
            ...person,
            lastInteraction: params.occurredAt,
            interactionCount: (typeof person.interactionCount === 'number' ? person.interactionCount : 0) + 1,
          };
        }),
      };
    });

    return {
      updatedCount,
      version: doc.version,
      updatedAt: doc.updatedAt,
    };
  }

  const uniqueIds = dedupeIds(params.bubbleIds);
  const sql = await getHostedSql();
  return sql.begin(async (tx) => {
    await ensureNormalizedStateInitialized(tx);
    const meta = await readStateMeta(tx);

    if (uniqueIds.length === 0) {
      return {
        updatedCount: 0,
        version: meta.version,
        updatedAt: toIsoString(meta.updated_at) ?? new Date().toISOString(),
      };
    }

    const targetRows = await tx<PersonRow[]>`
      select *
      from ${tx(HOSTED_TABLES.people)}
      where deleted_at is null
        and (
          id = any(${tx.array(uniqueIds)})
          or coalesce(duplicate_group_id, id) = any(${tx.array(uniqueIds)})
        )
    `;

    const targetGroupIds = new Set<string>();
    for (const row of targetRows) {
      targetGroupIds.add(row.duplicate_group_id ?? row.id);
    }

    if (targetGroupIds.size === 0) {
      return {
        updatedCount: 0,
        version: meta.version,
        updatedAt: toIsoString(meta.updated_at) ?? new Date().toISOString(),
      };
    }

    const rowsToConsider = await tx<PersonRow[]>`
      select *
      from ${tx(HOSTED_TABLES.people)}
      where deleted_at is null
        and coalesce(duplicate_group_id, id) = any(${tx.array(Array.from(targetGroupIds))})
      order by list_order asc, id asc
    `;

    const rowsToUpdate = rowsToConsider.filter((row) => {
      const currentIso = toIsoString(row.last_interaction);
      if (sameCalendarDayInTimeZone(currentIso, params.occurredAt, params.timeZone)) return false;
      return isMoreRecentIso(currentIso, params.occurredAt);
    });

    if (rowsToUpdate.length === 0) {
      return {
        updatedCount: 0,
        version: meta.version,
        updatedAt: toIsoString(meta.updated_at) ?? new Date().toISOString(),
      };
    }

    const nextVersion = meta.version + 1;
    const updatedAt = new Date().toISOString();

      for (const row of rowsToUpdate) {
      await tx`
        update ${tx(HOSTED_TABLES.people)}
        set last_interaction = ${params.occurredAt},
            interaction_count = ${Math.max(0, Number(row.interaction_count ?? 0)) + 1},
            interaction_updated_version = ${nextVersion},
            updated_version = ${nextVersion},
            updated_at = ${updatedAt}
        where id = ${row.id}
      `;
    }

    await upsertStateMeta(tx, nextVersion, updatedAt);

    return {
      updatedCount: rowsToUpdate.length,
      version: nextVersion,
      updatedAt,
    };
  });
}

async function getHostedSql() {
  const sql = await getPostgresClient();
  await ensureHostedSchema(sql);
  return sql;
}

async function ensureNormalizedStateInitialized(sql: SqlLike) {
  const existingMeta = await sql<MetaRow[]>`
    select *
    from ${sql(HOSTED_TABLES.meta)}
    where state_key = ${META_STATE_KEY}
    limit 1
  `;
  if (existingMeta[0]) {
    await ensureHostedImageBackfill(sql);
    return;
  }

  const legacy = await readJsonDocument<any>(APP_STATE_KEY);
  const initialDocument = legacy.value ? normalizeAppStateDocument(legacy.value) : createDefaultAppStateDocument();

  await importHostedAppState(sql, initialDocument).catch(async (error: any) => {
    if (error?.code === '23505') {
      return;
    }
    throw error;
  });
  await ensureHostedImageBackfill(sql);
}

async function ensureHostedImageBackfill(sql: SqlLike) {
  const rows = await sql<Array<{ id: string; image: string | null; updated_version: number; updated_at: string | Date }>>`
    select p.id, p.image, p.updated_version, p.updated_at
    from ${sql(HOSTED_TABLES.people)} p
    left join ${sql(HOSTED_TABLES.personImages)} i
      on i.id = p.id
      and i.deleted_at is null
    where p.deleted_at is null
      and coalesce(p.image, '') <> ''
      and i.id is null
  `;

  for (const row of rows) {
    if (!row.image) continue;
    await sql`
      insert into ${sql(HOSTED_TABLES.personImages)} (
        id,
        image,
        updated_version,
        updated_at,
        deleted_at
      ) values (
        ${row.id},
        ${row.image},
        ${Number(row.updated_version ?? 0)},
        ${toIsoString(row.updated_at) ?? new Date().toISOString()},
        ${null}
      )
      on conflict (id) do nothing
    `;
  }
}

async function readHostedAppStateDocument(sql: SqlLike) {
  const [meta, categories, labels, people, personImages, systemControls] = await Promise.all([
    readStateMeta(sql),
    sql<CategoryRow[]>`
      select *
      from ${sql(HOSTED_TABLES.categories)}
      where deleted_at is null
      order by sort_order asc, id asc
    `,
    sql<LabelRow[]>`
      select *
      from ${sql(HOSTED_TABLES.labels)}
      where deleted_at is null
      order by list_order asc, id asc
    `,
    sql<PersonRow[]>`
      select *
      from ${sql(HOSTED_TABLES.people)}
      where deleted_at is null
      order by list_order asc, id asc
    `,
    sql<PersonImageRow[]>`
      select *
      from ${sql(HOSTED_TABLES.personImages)}
      where deleted_at is null
    `,
    sql<SystemControlsRow[]>`
      select *
      from ${sql(HOSTED_TABLES.systemControls)}
      where scope = ${SYSTEM_CONTROLS_SCOPE}
      limit 1
    `,
  ]);

  const imageById = new Map(personImages.map((row) => [row.id, row.image] as const));

  const doc: AppStateDocument = {
    schemaVersion: 1,
    version: meta.version,
    updatedAt: toIsoString(meta.updated_at) ?? new Date().toISOString(),
    data: {
      version: 2,
      categories: categories.map(mapCategoryRow),
      labels: labels.map(mapLabelRow),
      people: people.map((row) => mapPersonRowWithImage(row, imageById.get(row.id))),
      systemControls: systemControls[0] ? mapSystemControlsRow(systemControls[0]) : { ...defaultSystemControls },
    },
  };

  return {
    doc,
    etag: String(doc.version),
  };
}

async function importHostedAppState(sql: SqlLike, doc: AppStateDocument) {
  await applyFullStateReplacement(sql, emptyExportSchema(), doc.data, doc.version, doc.updatedAt);
  await upsertStateMeta(sql, doc.version, doc.updatedAt);
}

async function readStateMeta(sql: SqlLike) {
  const rows = await sql<MetaRow[]>`
    select *
    from ${sql(HOSTED_TABLES.meta)}
    where state_key = ${META_STATE_KEY}
    limit 1
  `;

  const row = rows[0];
  if (row) {
    return row;
  }

  const initial = createDefaultAppStateDocument();
  await importHostedAppState(sql, initial);
  return {
    state_key: META_STATE_KEY,
    version: initial.version,
    updated_at: initial.updatedAt,
    schema_version: 1,
  };
}

async function upsertStateMeta(sql: SqlLike, version: number, updatedAt: string) {
  await sql`
    insert into ${sql(HOSTED_TABLES.meta)} (state_key, version, updated_at, schema_version)
    values (${META_STATE_KEY}, ${version}, ${updatedAt}, ${1})
    on conflict (state_key) do update
    set version = excluded.version,
        updated_at = excluded.updated_at,
        schema_version = excluded.schema_version
  `;
}

async function applyFullStateReplacement(
  sql: SqlLike,
  current: ExportSchema,
  next: ExportSchema,
  nextVersion: number,
  updatedAt: string
) {
  await syncCategories(sql, current.categories, next.categories, nextVersion, updatedAt);
  await syncLabels(sql, current.labels ?? [], next.labels ?? [], nextVersion, updatedAt);
  await syncPeople(sql, current.people, next.people, nextVersion, updatedAt);
  await syncSystemControls(
    sql,
    current.systemControls ?? { ...defaultSystemControls },
    next.systemControls ?? { ...defaultSystemControls },
    nextVersion,
    updatedAt
  );
}

async function syncCategories(
  sql: SqlLike,
  current: Category[],
  next: Category[],
  nextVersion: number,
  updatedAt: string
) {
  const currentMap = new Map(current.map((item) => [item.id, item] as const));
  const nextIds = new Set(next.map((item) => item.id));

  for (const category of next) {
    const previous = currentMap.get(category.id);
    if (previous && deepEqual(previous, category)) {
      continue;
    }

    await sql`
      insert into ${sql(HOSTED_TABLES.categories)} (
        id,
        name,
        description,
        time_limit_value,
        time_limit_unit,
        sort_order,
        gradient_colors,
        updated_version,
        updated_at,
        deleted_at
      ) values (
        ${category.id},
        ${category.name},
        ${category.description ?? ''},
        ${category.timeLimitValue},
        ${category.timeLimitUnit},
        ${category.sortOrder},
        ${sql.json(category.gradientColors ?? [])},
        ${nextVersion},
        ${updatedAt},
        ${null}
      )
      on conflict (id) do update
      set name = excluded.name,
          description = excluded.description,
          time_limit_value = excluded.time_limit_value,
          time_limit_unit = excluded.time_limit_unit,
          sort_order = excluded.sort_order,
          gradient_colors = excluded.gradient_colors,
          updated_version = excluded.updated_version,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
    `;
  }

  for (const category of current) {
    if (nextIds.has(category.id)) continue;
    await sql`
      update ${sql(HOSTED_TABLES.categories)}
      set deleted_at = ${updatedAt},
          updated_version = ${nextVersion},
          updated_at = ${updatedAt}
      where id = ${category.id}
        and deleted_at is null
    `;
  }
}

async function syncLabels(
  sql: SqlLike,
  current: Label[],
  next: Label[],
  nextVersion: number,
  updatedAt: string
) {
  const currentMap = new Map(current.map((item) => [item.id, item] as const));
  const nextIds = new Set(next.map((item) => item.id));

  for (let index = 0; index < next.length; index += 1) {
    const label = next[index];
    const previous = currentMap.get(label.id);
    const comparable = previous ? { ...previous, listOrder: index } : null;
    if (comparable && deepEqual({ ...label, listOrder: index }, comparable)) {
      continue;
    }

    await sql`
      insert into ${sql(HOSTED_TABLES.labels)} (
        id,
        name,
        color,
        list_order,
        updated_version,
        updated_at,
        deleted_at
      ) values (
        ${label.id},
        ${label.name},
        ${label.color},
        ${index},
        ${nextVersion},
        ${updatedAt},
        ${null}
      )
      on conflict (id) do update
      set name = excluded.name,
          color = excluded.color,
          list_order = excluded.list_order,
          updated_version = excluded.updated_version,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
    `;
  }

  for (const label of current) {
    if (nextIds.has(label.id)) continue;
    await sql`
      update ${sql(HOSTED_TABLES.labels)}
      set deleted_at = ${updatedAt},
          updated_version = ${nextVersion},
          updated_at = ${updatedAt}
      where id = ${label.id}
        and deleted_at is null
    `;
  }
}

async function syncPeople(
  sql: SqlLike,
  current: Person[],
  next: Person[],
  nextVersion: number,
  updatedAt: string
) {
  const currentMap = new Map(current.map((item) => [item.id, item] as const));
  const nextIds = new Set(next.map((item) => item.id));

  for (let index = 0; index < next.length; index += 1) {
    const person = next[index];
    const previous = currentMap.get(person.id);
    const comparable = previous ? { ...previous, listOrder: index } : null;
    if (comparable && deepEqual({ ...person, listOrder: index }, comparable)) {
      continue;
    }

    const nextImage = normalizeImageValue(person.image);
    const previousImage = normalizeImageValue(previous?.image);
    const imageChanged = nextImage !== previousImage;
    const nextImageVersion = imageChanged || !previous ? nextVersion : 0;

    await sql`
      insert into ${sql(HOSTED_TABLES.people)} (
        id,
        full_name,
        category_id,
        context,
        last_interaction,
        interaction_count,
        image,
        y_position,
        duplicate_group_id,
        label_ids,
        starred,
        archived_at,
        archived_from_category_id,
        archived_order,
        list_order,
        content_updated_version,
        interaction_updated_version,
        image_version,
        updated_version,
        updated_at,
        deleted_at
      ) values (
        ${person.id},
        ${person.fullName},
        ${person.categoryId},
        ${person.context ?? ''},
        ${person.lastInteraction},
        ${typeof person.interactionCount === 'number' ? person.interactionCount : 0},
        ${null},
        ${person.yPosition},
        ${person.duplicateGroupId ?? null},
        ${sql.json(person.labelIds ?? [])},
        ${!!person.starred},
        ${person.archivedAt ?? null},
        ${person.archivedFromCategoryId ?? null},
        ${person.archivedOrder ?? null},
        ${index},
        ${nextVersion},
        ${nextVersion},
        ${nextImageVersion},
        ${nextVersion},
        ${updatedAt},
        ${null}
      )
      on conflict (id) do update
      set full_name = excluded.full_name,
          category_id = excluded.category_id,
          context = excluded.context,
          last_interaction = excluded.last_interaction,
          interaction_count = excluded.interaction_count,
          image = excluded.image,
          y_position = excluded.y_position,
          duplicate_group_id = excluded.duplicate_group_id,
          label_ids = excluded.label_ids,
          starred = excluded.starred,
          archived_at = excluded.archived_at,
          archived_from_category_id = excluded.archived_from_category_id,
          archived_order = excluded.archived_order,
          list_order = excluded.list_order,
          content_updated_version = excluded.content_updated_version,
          interaction_updated_version = excluded.interaction_updated_version,
          image_version = case
            when excluded.image_version = 0 then ${sql(HOSTED_TABLES.people)}.image_version
            else excluded.image_version
          end,
          updated_version = excluded.updated_version,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
    `;

    if (nextImage) {
      if (imageChanged || !previous) {
        await sql`
          insert into ${sql(HOSTED_TABLES.personImages)} (
            id,
            image,
            updated_version,
            updated_at,
            deleted_at
          ) values (
            ${person.id},
            ${nextImage},
            ${nextVersion},
            ${updatedAt},
            ${null}
          )
          on conflict (id) do update
          set image = excluded.image,
              updated_version = excluded.updated_version,
              updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at
        `;
      }
    } else if (imageChanged || previousImage) {
      await sql`
        update ${sql(HOSTED_TABLES.personImages)}
        set deleted_at = ${updatedAt},
            updated_version = ${nextVersion},
            updated_at = ${updatedAt}
        where id = ${person.id}
          and deleted_at is null
      `;
    }
  }

  for (const person of current) {
    if (nextIds.has(person.id)) continue;
    await sql`
      update ${sql(HOSTED_TABLES.people)}
      set deleted_at = ${updatedAt},
          content_updated_version = ${nextVersion},
          interaction_updated_version = ${nextVersion},
          updated_version = ${nextVersion},
          updated_at = ${updatedAt}
      where id = ${person.id}
        and deleted_at is null
    `;
    await sql`
      update ${sql(HOSTED_TABLES.personImages)}
      set deleted_at = ${updatedAt},
          updated_version = ${nextVersion},
          updated_at = ${updatedAt}
      where id = ${person.id}
        and deleted_at is null
    `;
  }
}

async function syncSystemControls(
  sql: SqlLike,
  current: SystemControls,
  next: SystemControls,
  nextVersion: number,
  updatedAt: string
) {
  if (deepEqual(current, next)) {
    return;
  }

  await sql`
    insert into ${sql(HOSTED_TABLES.systemControls)} (
      scope,
      multi_select_hotkeys_enabled,
      multi_select_update_to_now_key,
      multi_select_archive_key,
      multi_select_delete_key,
      updated_version,
      updated_at
    ) values (
      ${SYSTEM_CONTROLS_SCOPE},
      ${next.multiSelectHotkeysEnabled},
      ${next.multiSelectUpdateToNowKey},
      ${next.multiSelectArchiveKey},
      ${next.multiSelectDeleteKey},
      ${nextVersion},
      ${updatedAt}
    )
    on conflict (scope) do update
    set multi_select_hotkeys_enabled = excluded.multi_select_hotkeys_enabled,
        multi_select_update_to_now_key = excluded.multi_select_update_to_now_key,
        multi_select_archive_key = excluded.multi_select_archive_key,
        multi_select_delete_key = excluded.multi_select_delete_key,
        updated_version = excluded.updated_version,
        updated_at = excluded.updated_at
  `;
}

function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    timeLimitValue: Number(row.time_limit_value),
    timeLimitUnit: row.time_limit_unit,
    sortOrder: Number(row.sort_order),
    gradientColors: toStringArray(row.gradient_colors),
  };
}

function mapLabelRow(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
  };
}

function mapPersonRowWithImage(row: PersonRow, image: string | undefined, includeImage = true): Person {
  const person: Person = {
    id: row.id,
    fullName: row.full_name,
    categoryId: row.category_id,
    context: row.context ?? '',
    lastInteraction: toIsoString(row.last_interaction) ?? new Date().toISOString(),
    interactionCount: Number(row.interaction_count ?? 0),
    yPosition: Number(row.y_position),
    duplicateGroupId: row.duplicate_group_id ?? undefined,
    labelIds: toStringArray(row.label_ids),
    starred: !!row.starred,
    archivedAt: toIsoString(row.archived_at),
    archivedFromCategoryId: row.archived_from_category_id ?? undefined,
    archivedOrder: typeof row.archived_order === 'number' ? row.archived_order : undefined,
  };
  if (includeImage && typeof image === 'string' && image.length > 0) {
    person.image = image;
  }
  return person;
}

function mapPersonImageRow(row: PersonImageRow): PersonImageAsset {
  return {
    id: row.id,
    image: row.image,
    imageVersion: Number(row.updated_version),
  };
}

function mapPersonInteractionRow(row: PersonRow): PersonInteractionDelta {
  return {
    id: row.id,
    lastInteraction: toIsoString(row.last_interaction) ?? new Date().toISOString(),
    interactionCount: Number(row.interaction_count ?? 0),
  };
}

function mapSystemControlsRow(row: SystemControlsRow): SystemControls {
  return {
    multiSelectHotkeysEnabled: !!row.multi_select_hotkeys_enabled,
    multiSelectUpdateToNowKey: row.multi_select_update_to_now_key ?? null,
    multiSelectArchiveKey: row.multi_select_archive_key ?? null,
    multiSelectDeleteKey: row.multi_select_delete_key ?? null,
  };
}

function splitCollectionDelta<Row, Model extends { id: string }>(
  rows: Array<Row & { id: string; deleted_at: string | Date | null }>,
  mapRow: (row: Row) => Model
) {
  const deletedIds: string[] = [];
  const upserted: Model[] = [];

  for (const row of rows) {
    if (row.deleted_at) {
      deletedIds.push(row.id);
      continue;
    }
    upserted.push(mapRow(row));
  }

  return { upserted, deletedIds };
}

function splitPeopleDelta(rows: PersonRow[], sinceVersion: number) {
  const people: RemoteStateDelta['people'] = { upserted: [], deletedIds: [] };
  const interactions: PersonInteractionDelta[] = [];

  for (const row of rows) {
    if (row.deleted_at) {
      people.deletedIds.push(row.id);
      continue;
    }

    if (Number(row.content_updated_version ?? 0) > sinceVersion) {
      people.upserted.push(mapPersonRowWithImage(row, undefined, false));
      continue;
    }

    if (Number(row.interaction_updated_version ?? 0) > sinceVersion) {
      interactions.push(mapPersonInteractionRow(row));
    }
  }

  return { people, interactions };
}

function buildFullDelta(state: ExportSchema, version: number, updatedAt: string): RemoteStateDelta {
  return {
    version,
    updatedAt,
    categories: {
      upserted: state.categories,
      deletedIds: [],
    },
    labels: {
      upserted: state.labels ?? [],
      deletedIds: [],
    },
    people: {
      upserted: state.people.map(({ image, ...person }) => person),
      deletedIds: [],
    },
    personImages: {
      upserted: state.people
        .filter((person) => typeof person.image === 'string' && person.image.length > 0)
        .map((person) => ({
          id: person.id,
          image: person.image as string,
          imageVersion: version,
        })),
      deletedIds: [],
    },
    personInteractions: [],
    systemControls: state.systemControls ?? { ...defaultSystemControls },
  };
}

function emptyDelta(version: number, updatedAt: string): RemoteStateDelta {
  return {
    version,
    updatedAt,
    categories: { upserted: [], deletedIds: [] },
    labels: { upserted: [], deletedIds: [] },
    people: { upserted: [], deletedIds: [] },
    personImages: { upserted: [], deletedIds: [] },
    personInteractions: [],
    systemControls: null,
  };
}

function emptyExportSchema(): ExportSchema {
  return {
    version: 2,
    categories: [],
    people: [],
    labels: [],
    systemControls: { ...defaultSystemControls },
  };
}

function createDefaultAppStateDocument(): AppStateDocument {
  return {
    schemaVersion: 1,
    version: 1,
    updatedAt: new Date().toISOString(),
    data: createDefaultExportData(),
  };
}

function normalizeAppStateDocument(raw: any): AppStateDocument {
  if (raw && typeof raw === 'object' && typeof raw.version === 'number' && raw.data) {
    const fallback = createDefaultExportData();
    return {
      schemaVersion: 1,
      version: Math.max(1, raw.version),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      data: normalizeExportSchema(raw.data, fallback),
    };
  }

  if (raw && typeof raw === 'object' && Array.isArray(raw.categories) && Array.isArray(raw.people)) {
    return {
      schemaVersion: 1,
      version: 1,
      updatedAt: new Date().toISOString(),
      data: normalizeExportSchema(raw, createDefaultExportData()),
    };
  }

  return createDefaultAppStateDocument();
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeImageValue(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return date.toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function dedupeIds(ids: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function legacyGetAppStateDocument() {
  const existing = await readJsonDocument<any>(APP_STATE_KEY);
  if (existing.value) {
    return {
      doc: normalizeAppStateDocument(existing.value),
      etag: existing.etag,
    };
  }

  const initialDocument = createDefaultAppStateDocument();
  try {
    const etag = await writeJsonDocument(APP_STATE_KEY, initialDocument, null);
    return { doc: initialDocument, etag };
  } catch (error) {
    if (error instanceof StorageConflictError) {
      return legacyGetAppStateDocument();
    }
    throw error;
  }
}

async function legacyReplaceAppState(nextState: ExportSchema, baseVersion: number) {
  const { doc, etag } = await legacyGetAppStateDocument();
  if (doc.version !== baseVersion) {
    return {
      ok: false as const,
      reason: 'version_mismatch' as const,
      current: doc,
    };
  }

  const nextDoc: AppStateDocument = {
    schemaVersion: 1,
    version: doc.version + 1,
    updatedAt: new Date().toISOString(),
    data: normalizeExportSchema(cloneExportSchema(nextState), doc.data),
  };

  try {
    const nextEtag = await writeJsonDocument(APP_STATE_KEY, nextDoc, etag);
    return {
      ok: true as const,
      doc: nextDoc,
      etag: nextEtag,
    };
  } catch (error) {
    if (error instanceof StorageConflictError) {
      const current = await legacyGetAppStateDocument();
      if (current.doc.version === doc.version) {
        await overwriteJsonDocument(APP_STATE_KEY, nextDoc);
        return {
          ok: true as const,
          doc: nextDoc,
          etag: null,
        };
      }

      return {
        ok: false as const,
        reason: 'version_mismatch' as const,
        current: current.doc,
      };
    }
    throw error;
  }
}

async function legacyMutateAppState(mutator: (current: ExportSchema) => ExportSchema) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await legacyGetAppStateDocument();
    const currentData = cloneExportSchema(doc.data);
    const nextData = normalizeExportSchema(mutator(currentData), doc.data);

    if (deepEqual(nextData, doc.data)) {
      return doc;
    }

    const nextDoc: AppStateDocument = {
      schemaVersion: 1,
      version: doc.version + 1,
      updatedAt: new Date().toISOString(),
      data: nextData,
    };

    try {
      await writeJsonDocument(APP_STATE_KEY, nextDoc, etag);
      return nextDoc;
    } catch (error) {
      if (!(error instanceof StorageConflictError)) {
        throw error;
      }

      const current = await legacyGetAppStateDocument();
      if (current.doc.version === doc.version) {
        await overwriteJsonDocument(APP_STATE_KEY, nextDoc);
        return nextDoc;
      }
    }
  }

  throw new Error('Could not update Bubble state after repeated write conflicts');
}
