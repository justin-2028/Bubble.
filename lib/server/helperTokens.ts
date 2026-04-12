import 'server-only';

import crypto from 'node:crypto';
import postgres from 'postgres';
import { HelperTokenSummary } from '../cloud';
import { isDatabaseConfigured } from './env';
import { HOSTED_TABLES, ensureHostedSchema } from './hostedSchema';
import { StorageConflictError, readJsonDocument, writeJsonDocument } from './jsonStore';
import { getPostgresClient } from './postgresClient';

const HELPER_TOKENS_KEY = 'helper-tokens';
const LAST_USED_WRITE_INTERVAL_MS = 15 * 60 * 1000;

type HelperTokenRecord = {
  id: string;
  name: string;
  prefix: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

type HelperTokensDocument = {
  schemaVersion: 1;
  tokens: HelperTokenRecord[];
};

type HelperTokenRow = {
  id: string;
  name: string;
  prefix: string;
  token_hash: string;
  created_at: string | Date;
  last_used_at: string | Date | null;
  revoked_at: string | Date | null;
};

export async function listHelperTokens() {
  if (!isDatabaseConfigured()) {
    return legacyListHelperTokens();
  }

  const sql = await getHostedSql();
  await ensureHelperTokensInitialized(sql);
  const rows = await sql<HelperTokenRow[]>`
    select *
    from ${sql(HOSTED_TABLES.helperTokens)}
    where revoked_at is null
    order by created_at desc
  `;
  return rows.map(mapRowToSummary);
}

export async function createHelperToken(name: string) {
  if (!isDatabaseConfigured()) {
    return legacyCreateHelperToken(name);
  }

  const sql = await getHostedSql();
  await ensureHelperTokensInitialized(sql);

  const cleanName = name.trim() || 'Mac Helper';
  const plaintext = `bubble_helper_${crypto.randomBytes(24).toString('base64url')}`;
  const tokenHash = hashToken(plaintext);
  const prefix = plaintext.slice(0, 18);
  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();

  await sql`
    insert into ${sql(HOSTED_TABLES.helperTokens)} (
      id,
      name,
      prefix,
      token_hash,
      created_at,
      last_used_at,
      revoked_at
    ) values (
      ${id},
      ${cleanName},
      ${prefix},
      ${tokenHash},
      ${createdAt},
      ${null},
      ${null}
    )
  `;

  return {
    token: plaintext,
    summary: {
      id,
      name: cleanName,
      prefix,
      createdAt,
      lastUsedAt: undefined,
    },
  };
}

export async function revokeHelperToken(id: string) {
  if (!isDatabaseConfigured()) {
    return legacyRevokeHelperToken(id);
  }

  const sql = await getHostedSql();
  await ensureHelperTokensInitialized(sql);
  const rows = await sql<{ id: string }[]>`
    update ${sql(HOSTED_TABLES.helperTokens)}
    set revoked_at = now()
    where id = ${id}
      and revoked_at is null
    returning id
  `;
  return !!rows[0]?.id;
}

export async function authenticateHelperToken(token: string) {
  if (!isDatabaseConfigured()) {
    return legacyAuthenticateHelperToken(token);
  }

  const sql = await getHostedSql();
  await ensureHelperTokensInitialized(sql);

  const tokenHash = hashToken(token);
  const rows = await sql<HelperTokenRow[]>`
    select *
    from ${sql(HOSTED_TABLES.helperTokens)}
    where revoked_at is null
  `;
  const match = rows.find((row) => timingSafeEqualHash(row.token_hash, tokenHash));
  if (!match) {
    return null;
  }

  const lastUsedAt = toIsoString(match.last_used_at);
  const lastUsedAtMs = lastUsedAt ? Date.parse(lastUsedAt) : NaN;
  if (!Number.isFinite(lastUsedAtMs) || Date.now() - lastUsedAtMs >= LAST_USED_WRITE_INTERVAL_MS) {
    await sql`
      update ${sql(HOSTED_TABLES.helperTokens)}
      set last_used_at = now()
      where id = ${match.id}
    `;
  }

  return mapRowToRecord(match);
}

async function getHostedSql() {
  const sql = await getPostgresClient();
  await ensureHostedSchema(sql);
  return sql;
}

async function ensureHelperTokensInitialized(sql: postgres.Sql<any>) {
  const existing = await sql<{ count: string }[]>`
    select count(*)::text as count
    from ${sql(HOSTED_TABLES.helperTokens)}
  `;
  if (Number(existing[0]?.count ?? 0) > 0) {
    return;
  }

  const legacy = await readJsonDocument<any>(HELPER_TOKENS_KEY);
  if (!legacy.value) {
    return;
  }

  const doc = normalizeHelperTokensDocument(legacy.value);
  for (const token of doc.tokens) {
    await sql`
      insert into ${sql(HOSTED_TABLES.helperTokens)} (
        id,
        name,
        prefix,
        token_hash,
        created_at,
        last_used_at,
        revoked_at
      ) values (
        ${token.id},
        ${token.name},
        ${token.prefix},
        ${token.tokenHash},
        ${token.createdAt},
        ${token.lastUsedAt ?? null},
        ${token.revokedAt ?? null}
      )
      on conflict (id) do nothing
    `;
  }
}

function mapRowToSummary(row: HelperTokenRow): HelperTokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    lastUsedAt: toIsoString(row.last_used_at),
  };
}

function mapRowToRecord(row: HelperTokenRow): HelperTokenRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    tokenHash: row.token_hash,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    lastUsedAt: toIsoString(row.last_used_at),
    revokedAt: toIsoString(row.revoked_at),
  };
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

async function legacyListHelperTokens() {
  const { doc } = await getLegacyHelperTokensDocument();
  return doc.tokens
    .filter((token) => !token.revokedAt)
    .map(toHelperTokenSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function legacyCreateHelperToken(name: string) {
  const cleanName = name.trim() || 'Mac Helper';
  const plaintext = `bubble_helper_${crypto.randomBytes(24).toString('base64url')}`;
  const tokenHash = hashToken(plaintext);
  const prefix = plaintext.slice(0, 18);
  const createdAt = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await getLegacyHelperTokensDocument();
    const nextRecord: HelperTokenRecord = {
      id: crypto.randomUUID(),
      name: cleanName,
      prefix,
      tokenHash,
      createdAt,
    };
    const nextDoc: HelperTokensDocument = {
      schemaVersion: 1,
      tokens: [...doc.tokens, nextRecord],
    };

    try {
      await writeJsonDocument(HELPER_TOKENS_KEY, nextDoc, etag);
      return {
        token: plaintext,
        summary: toHelperTokenSummary(nextRecord),
      };
    } catch (error) {
      if (!(error instanceof StorageConflictError)) {
        throw error;
      }
    }
  }

  throw new Error('Could not create helper token after repeated write conflicts');
}

async function legacyRevokeHelperToken(id: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await getLegacyHelperTokensDocument();
    let changed = false;
    const nextTokens = doc.tokens.map((token) => {
      if (token.id !== id || token.revokedAt) return token;
      changed = true;
      return {
        ...token,
        revokedAt: new Date().toISOString(),
      };
    });

    if (!changed) return false;

    try {
      await writeJsonDocument(
        HELPER_TOKENS_KEY,
        {
          schemaVersion: 1,
          tokens: nextTokens,
        },
        etag
      );
      return true;
    } catch (error) {
      if (!(error instanceof StorageConflictError)) {
        throw error;
      }
    }
  }

  throw new Error('Could not revoke helper token after repeated write conflicts');
}

async function legacyAuthenticateHelperToken(token: string) {
  const tokenHash = hashToken(token);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await getLegacyHelperTokensDocument();
    const match = doc.tokens.find((record) => !record.revokedAt && timingSafeEqualHash(record.tokenHash, tokenHash));
    if (!match) return null;

    const lastUsedAtMs = match.lastUsedAt ? Date.parse(match.lastUsedAt) : NaN;
    if (Number.isFinite(lastUsedAtMs) && Date.now() - lastUsedAtMs < LAST_USED_WRITE_INTERVAL_MS) {
      return match;
    }

    const nextTokens = doc.tokens.map((record) =>
      record.id === match.id
        ? {
            ...record,
            lastUsedAt: new Date().toISOString(),
          }
        : record
    );

    try {
      await writeJsonDocument(
        HELPER_TOKENS_KEY,
        {
          schemaVersion: 1,
          tokens: nextTokens,
        },
        etag
      );
      return match;
    } catch (error) {
      if (!(error instanceof StorageConflictError)) {
        throw error;
      }
    }
  }

  throw new Error('Could not authenticate helper token after repeated write conflicts');
}

async function getLegacyHelperTokensDocument() {
  const existing = await readJsonDocument<any>(HELPER_TOKENS_KEY);
  if (existing.value) {
    return {
      doc: normalizeHelperTokensDocument(existing.value),
      etag: existing.etag,
    };
  }

  const emptyDocument: HelperTokensDocument = {
    schemaVersion: 1,
    tokens: [],
  };

  try {
    const etag = await writeJsonDocument(HELPER_TOKENS_KEY, emptyDocument, null);
    return { doc: emptyDocument, etag };
  } catch (error) {
    if (error instanceof StorageConflictError) {
      return getLegacyHelperTokensDocument();
    }
    throw error;
  }
}

function normalizeHelperTokensDocument(raw: any): HelperTokensDocument {
  return {
    schemaVersion: 1,
    tokens: Array.isArray(raw?.tokens)
      ? raw.tokens
          .filter((token: any) => token && typeof token === 'object' && typeof token.id === 'string')
          .map((token: any) => ({
            id: token.id,
            name: typeof token.name === 'string' ? token.name : 'Mac Helper',
            prefix: typeof token.prefix === 'string' ? token.prefix : 'bubble_helper_',
            tokenHash: typeof token.tokenHash === 'string' ? token.tokenHash : '',
            createdAt: typeof token.createdAt === 'string' ? token.createdAt : new Date().toISOString(),
            lastUsedAt: typeof token.lastUsedAt === 'string' ? token.lastUsedAt : undefined,
            revokedAt: typeof token.revokedAt === 'string' ? token.revokedAt : undefined,
          }))
      : [],
  };
}

function toHelperTokenSummary(token: HelperTokenRecord): HelperTokenSummary {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
  };
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function timingSafeEqualHash(a: string, b: string) {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}
