import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStorageSecret, isBlobConfigured, requiresDurableHostedStorage } from './env';

const LOCAL_STORE_DIR = path.join(process.cwd(), '.bubble-data');

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
  if (isBlobConfigured()) {
    return readBlobJsonDocument<T>(key);
  }
  assertLocalFallbackAllowed();
  return readLocalJsonDocument<T>(key);
}

export async function writeJsonDocument<T>(key: string, value: T, etag?: string | null) {
  if (isBlobConfigured()) {
    return writeBlobJsonDocument(key, value, etag ?? null);
  }
  assertLocalFallbackAllowed();
  return writeLocalJsonDocument(key, value, etag ?? null);
}

function localPathForKey(key: string) {
  return path.join(LOCAL_STORE_DIR, `${key}.json`);
}

function blobPathForKey(key: string) {
  return `bubble-private/${key}.json`;
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

function hashContent(content: string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function assertLocalFallbackAllowed() {
  if (!requiresDurableHostedStorage()) {
    return;
  }

  throw new Error(
    'BLOB_READ_WRITE_TOKEN must be configured for hosted Bubble storage in production. Local JSON fallback is development-only.'
  );
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
