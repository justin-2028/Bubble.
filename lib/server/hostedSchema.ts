import 'server-only';

import postgres from 'postgres';

export const HOSTED_TABLES = {
  meta: 'bubble_state_meta',
  categories: 'bubble_categories',
  labels: 'bubble_labels',
  people: 'bubble_people',
  personImages: 'bubble_person_images',
  systemControls: 'bubble_system_controls',
  helperTokens: 'bubble_helper_tokens',
} as const;

let schemaReadyPromise: Promise<void> | null = null;

export async function ensureHostedSchema(sql: postgres.Sql) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = actuallyEnsureHostedSchema(sql).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
}

async function actuallyEnsureHostedSchema(sql: postgres.Sql) {
  await sql`
    create table if not exists ${sql(HOSTED_TABLES.meta)} (
      state_key text primary key,
      version integer not null,
      updated_at timestamptz not null,
      schema_version integer not null default 1
    )
  `;

  await sql`
    create table if not exists ${sql(HOSTED_TABLES.categories)} (
      id text primary key,
      name text not null,
      description text not null default '',
      time_limit_value integer not null,
      time_limit_unit text not null,
      sort_order integer not null,
      gradient_colors jsonb not null,
      updated_version integer not null,
      updated_at timestamptz not null,
      deleted_at timestamptz
    )
  `;
  await sql`
    create index if not exists bubble_categories_updated_version_idx
    on ${sql(HOSTED_TABLES.categories)} (updated_version)
  `;

  await sql`
    create table if not exists ${sql(HOSTED_TABLES.labels)} (
      id text primary key,
      name text not null,
      color text not null,
      list_order integer not null,
      updated_version integer not null,
      updated_at timestamptz not null,
      deleted_at timestamptz
    )
  `;
  await sql`
    create index if not exists bubble_labels_updated_version_idx
    on ${sql(HOSTED_TABLES.labels)} (updated_version)
  `;

  await sql`
    create table if not exists ${sql(HOSTED_TABLES.people)} (
      id text primary key,
      full_name text not null,
      category_id text not null,
      context text not null default '',
      last_interaction timestamptz not null,
      interaction_count integer not null default 0,
      image text,
      y_position double precision not null,
      duplicate_group_id text,
      label_ids jsonb not null default '[]'::jsonb,
      starred boolean not null default false,
      archived_at timestamptz,
      archived_from_category_id text,
      archived_order integer,
      list_order integer not null,
      content_updated_version integer not null default 0,
      interaction_updated_version integer not null default 0,
      image_version integer not null default 0,
      updated_version integer not null,
      updated_at timestamptz not null,
      deleted_at timestamptz
    )
  `;
  await sql`
    alter table ${sql(HOSTED_TABLES.people)}
    add column if not exists content_updated_version integer not null default 0
  `;
  await sql`
    alter table ${sql(HOSTED_TABLES.people)}
    add column if not exists interaction_updated_version integer not null default 0
  `;
  await sql`
    alter table ${sql(HOSTED_TABLES.people)}
    add column if not exists image_version integer not null default 0
  `;
  await sql`
    create index if not exists bubble_people_updated_version_idx
    on ${sql(HOSTED_TABLES.people)} (updated_version)
  `;
  await sql`
    create index if not exists bubble_people_content_updated_version_idx
    on ${sql(HOSTED_TABLES.people)} (content_updated_version)
  `;
  await sql`
    create index if not exists bubble_people_interaction_updated_version_idx
    on ${sql(HOSTED_TABLES.people)} (interaction_updated_version)
  `;
  await sql`
    create index if not exists bubble_people_image_version_idx
    on ${sql(HOSTED_TABLES.people)} (image_version)
  `;
  await sql`
    create index if not exists bubble_people_category_id_idx
    on ${sql(HOSTED_TABLES.people)} (category_id)
  `;
  await sql`
    create index if not exists bubble_people_duplicate_group_id_idx
    on ${sql(HOSTED_TABLES.people)} (duplicate_group_id)
  `;
  await sql`
    update ${sql(HOSTED_TABLES.people)}
    set content_updated_version = updated_version
    where content_updated_version = 0
  `;
  await sql`
    update ${sql(HOSTED_TABLES.people)}
    set interaction_updated_version = updated_version
    where interaction_updated_version = 0
  `;
  await sql`
    update ${sql(HOSTED_TABLES.people)}
    set image_version = updated_version
    where image_version = 0
      and coalesce(image, '') <> ''
  `;

  await sql`
    create table if not exists ${sql(HOSTED_TABLES.personImages)} (
      id text primary key,
      image text not null,
      updated_version integer not null,
      updated_at timestamptz not null,
      deleted_at timestamptz
    )
  `;
  await sql`
    create index if not exists bubble_person_images_updated_version_idx
    on ${sql(HOSTED_TABLES.personImages)} (updated_version)
  `;

  await sql`
    create table if not exists ${sql(HOSTED_TABLES.systemControls)} (
      scope text primary key,
      multi_select_hotkeys_enabled boolean not null,
      multi_select_update_to_now_key text,
      multi_select_archive_key text,
      multi_select_delete_key text,
      updated_version integer not null,
      updated_at timestamptz not null
    )
  `;

  await sql`
    create table if not exists ${sql(HOSTED_TABLES.helperTokens)} (
      id text primary key,
      name text not null,
      prefix text not null,
      token_hash text not null,
      created_at timestamptz not null,
      last_used_at timestamptz,
      revoked_at timestamptz
    )
  `;
  await sql`
    create index if not exists bubble_helper_tokens_created_at_idx
    on ${sql(HOSTED_TABLES.helperTokens)} (created_at desc)
  `;
  await sql`
    create index if not exists bubble_helper_tokens_prefix_idx
    on ${sql(HOSTED_TABLES.helperTokens)} (prefix)
  `;
}
