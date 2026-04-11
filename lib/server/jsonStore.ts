import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { getDatabaseUrl, getStorageSecret, isBlobConfigured, isDatabaseConfigured, requiresDurableHostedStorage } from './env';

const LOCAL_STORE_DIR = path.join(process.cwd(), '.bubble-data');
const POSTGRES_TABLE = 'bubble_documents';
const POSTGRES_CONNECT_TIMEOUT_SECONDS = 30;
const POSTGRES_INIT_RETRIES = 2;

let sqlClient: postgres.Sql | null = null;
let schemaReadyPromise: Promise<void> | null = null;

export class StorageConflictError extends Error {
  constructor(key: string) {
    super(`Storage conflict while writing ${key}`);
    this.name = 'StorageConflictError';
  }
}

export type JsonReadResult<T> = {
  value: T | null;
  etag: string | null;
};

export async function readJsonDocument<T>(key: string): Promise<JsonReadResult<T>> {
  if (isDatabaseConfigured()) {
    const existing = await readPostgresJsonDocument<T>(key);
    if (existing.value !== null || existing.etag !== null) {
      return existing;
    }

    if (isBlobConfigured()) {
      const migrated = await readBlobJsonDocument<T>(key);
      if (migrated.value !== null || migrated.etag !== null) {
        const migratedEtag = await overwritePostgresJsonDocument(key, migrated.value);
        return {
          value: migrated.value,
          etag: migratedEtag,
        };
      }
    }

    return { value: null, etag: null };
  }

  if (isBlobConfigured()) {
    return readBlobJsonDocument<T>(key);
  }
  assertLocalFallbackAllowed();
  return readLocalJsonDocument<T>(key);
}

export async function writeJsonDocument<T>(key: string, value: T, etag?: string | null) {
  if (isDatabaseConfigured()) {
    return writePostgresJsonDocument(key, value, etag ?? null);
  }

  if (isBlobConfigured()) {
    return writeBlobJsonDocument(key, value, etag ?? null);
  }
  assertLocalFallbackAllowed();
  return writeLocalJsonDocument(key, value, etag ?? null);
}

export async function overwriteJsonDocument<T>(key: string, value: T) {
  if (isDatabaseConfigured()) {
    return overwritePostgresJsonDocument(key, value);
  }

  if (isBlobConfigured()) {
    return overwriteBlobJsonDocument(key, value);
  }
  assertLocalFallbackAllowed();
  return writeLocalJsonDocument(key, value, null);
}

function localPathForKey(key: string) {
  return path.join(LOCAL_STORE_DIR, `${key}.json`);
}

function blobPathForKey(key: string) {
  return `bubble-private/${key}.json`;
}

async function readPostgresJsonDocument<T>(key: string): Promise<JsonReadResult<T>> {
  const sql = await getPostgresClient();
  const rows = await sql<{ payload: string; etag: string }[]>`
    select payload, etag
    from ${sql(POSTGRES_TABLE)}
    where document_key = ${key}
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return { value: null, etag: null };
  }

  const text = decryptContent(row.payload);
  return {
    value: text ? (JSON.parse(text) as T) : null,
    etag: row.etag,
  };
}

async function writePostgresJsonDocument<T>(key: string, value: T, etag: string | null) {
  const sql = await getPostgresClient();
  const encrypted = encryptContent(JSON.stringify(value, null, 2));
  const nextEtag = crypto.randomUUID();

  if (etag === null) {
    const rows = await sql<{ etag: string }[]>`
      insert into ${sql(POSTGRES_TABLE)} (document_key, payload, etag, updated_at)
      values (${key}, ${encrypted}, ${nextEtag}, now())
      on conflict (document_key) do nothing
      returning etag
    `;

    if (!rows[0]?.etag) {
      throw new StorageConflictError(key);
    }

    return rows[0].etag;
  }

  const rows = await sql<{ etag: string }[]>`
    update ${sql(POSTGRES_TABLE)}
    set payload = ${encrypted},
        etag = ${nextEtag},
        updated_at = now()
    where document_key = ${key}
      and etag = ${etag}
    returning etag
  `;

  if (!rows[0]?.etag) {
    throw new StorageConflictError(key);
  }

  return rows[0].etag;
}

async function overwritePostgresJsonDocument<T>(key: string, value: T) {
  const sql = await getPostgresClient();
  const encrypted = encryptContent(JSON.stringify(value, null, 2));
  const nextEtag = crypto.randomUUID();
  const rows = await sql<{ etag: string }[]>`
    insert into ${sql(POSTGRES_TABLE)} (document_key, payload, etag, updated_at)
    values (${key}, ${encrypted}, ${nextEtag}, now())
    on conflict (document_key) do update
    set payload = excluded.payload,
        etag = excluded.etag,
        updated_at = excluded.updated_at
    returning etag
  `;

  return rows[0]?.etag ?? nextEtag;
}

async function readLocalJsonDocument<T>(key: string): Promise<JsonReadResult<T>> {
  try {
    const text = await fs.readFile(localPathForKey(key), 'utf8');
    return {
      value: JSON.parse(text) as T,
      etag: hashContent(text),
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { value: null, etag: null };
    }
    throw error;
  }
}

async function writeLocalJsonDocument<T>(key: string, value: T, etag: string | null) {
  await fs.mkdir(LOCAL_STORE_DIR, { recursive: true });
  const filePath = localPathForKey(key);
  const nextText = JSON.stringify(value, null, 2);

  let currentText: string | null = null;
  try {
    currentText = await fs.readFile(filePath, 'utf8');
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const currentEtag = currentText ? hashContent(currentText) : null;
  if (etag && currentEtag !== etag) {
    throw new StorageConflictError(key);
  }
  if (etag && !currentEtag) {
    throw new StorageConflictError(key);
  }

  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, nextText, 'utf8');
  await fs.rename(tempPath, filePath);
  return hashContent(nextText);
}

async function readBlobJsonDocument<T>(key: string): Promise<JsonReadResult<T>> {
  const { get } = await import('@vercel/blob');
  const result = await get(blobPathForKey(key), {
    access: 'private',
    useCache: false,
  });

  if (!result) {
    return { value: null, etag: null };
  }

  if (result.statusCode !== 200 || !result.stream) {
    return { value: null, etag: result.blob.etag };
  }

  const encryptedText = await new Response(result.stream).text();
  const text = decryptContent(encryptedText);
  return {
    value: text ? (JSON.parse(text) as T) : null,
    etag: result.blob.etag,
  };
}

async function writeBlobJsonDocument<T>(key: string, value: T, etag: string | null) {
  const { BlobPreconditionFailedError, put } = await import('@vercel/blob');
  const serialized = JSON.stringify(value, null, 2);
  const encrypted = encryptContent(serialized);

  try {
    const result = await put(blobPathForKey(key), encrypted, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: etag !== null,
      ifMatch: etag ?? undefined,
      cacheControlMaxAge: 60,
      contentType: 'text/plain; charset=utf-8',
    });

    return result.etag;
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      throw new StorageConflictError(key);
    }

    if (etag === null) {
      const current = await readBlobJsonDocument<T>(key).catch(() => null);
      if (current?.etag) {
        throw new StorageConflictError(key);
      }
    }

    throw error;
  }
}

async function overwriteBlobJsonDocument<T>(key: string, value: T) {
  const { put } = await import('@vercel/blob');
  const serialized = JSON.stringify(value, null, 2);
  const encrypted = encryptContent(serialized);
  const result = await put(blobPathForKey(key), encrypted, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: 'text/plain; charset=utf-8',
  });

  return result.etag;
}

function hashContent(content: string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function assertLocalFallbackAllowed() {
  if (!requiresDurableHostedStorage()) {
    return;
  }

  throw new Error(
    'DATABASE_URL or a temporary BLOB_READ_WRITE_TOKEN must be configured for hosted Bubble storage in production. Local JSON fallback is development-only.'
  );
}

async function getPostgresClient() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be configured for hosted Postgres storage');
  }
  let lastError: unknown;

  for (let attempt = 0; attempt < POSTGRES_INIT_RETRIES; attempt += 1) {
    try {
      if (!sqlClient) {
        const candidate = postgres(databaseUrl, {
          max: 1,
          prepare: false,
          idle_timeout: 20,
          connect_timeout: POSTGRES_CONNECT_TIMEOUT_SECONDS,
          onclose: () => {
            if (sqlClient === candidate) {
              sqlClient = null;
              schemaReadyPromise = null;
            }
          },
        });
        sqlClient = candidate;
      }

      if (!schemaReadyPromise) {
        const candidate = sqlClient;
        schemaReadyPromise = ensurePostgresSchema(candidate).catch(async (error) => {
          if (sqlClient === candidate) {
            await resetPostgresClient(candidate);
          } else {
            schemaReadyPromise = null;
          }
          throw error;
        });
      }

      await schemaReadyPromise;
      return sqlClient;
    } catch (error) {
      lastError = error;
      if (attempt < POSTGRES_INIT_RETRIES - 1) {
        await resetPostgresClient();
        await delay((attempt + 1) * 500);
        continue;
      }
    }
  }

  throw lastError;
}

async function ensurePostgresSchema(sql: postgres.Sql) {
  await sql`
    create table if not exists ${sql(POSTGRES_TABLE)} (
      document_key text primary key,
      payload text not null,
      etag text not null,
      updated_at timestamptz not null default now()
    )
  `;
}

async function resetPostgresClient(expectedClient?: postgres.Sql | null) {
  const client = expectedClient && sqlClient !== expectedClient ? null : sqlClient;
  sqlClient = null;
  schemaReadyPromise = null;

  if (!client) {
    return;
  }

  try {
    await client.end({ timeout: 0 });
  } catch {
    // Ignore cleanup failures while forcing a fresh client on the next request.
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encryptContent(plaintext: string) {
  const secret = getStorageSecret();
  if (!secret) {
    throw new Error('BUBBLE_STORAGE_SECRET or BUBBLE_SESSION_SECRET must be configured for hosted blob storage');
  }
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64url'),
    tag: authTag.toString('base64url'),
    data: encrypted.toString('base64url'),
  });
}

function decryptContent(serializedPayload: string) {
  const secret = getStorageSecret();
  if (!secret) {
    throw new Error('BUBBLE_STORAGE_SECRET or BUBBLE_SESSION_SECRET must be configured for hosted blob storage');
  }
  const payload = JSON.parse(serializedPayload) as { v: number; iv: string; tag: string; data: string };
  if (!payload || payload.v !== 1 || !payload.iv || !payload.tag || !payload.data) {
    throw new Error('Invalid encrypted blob payload');
  }
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
