import 'server-only';

import crypto from 'node:crypto';
import { HelperTokenSummary } from '../cloud';
import { StorageConflictError, readJsonDocument, writeJsonDocument } from './jsonStore';

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

export async function listHelperTokens() {
  const { doc } = await getHelperTokensDocument();
  return doc.tokens
    .filter((token) => !token.revokedAt)
    .map(toHelperTokenSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createHelperToken(name: string) {
  const cleanName = name.trim() || 'Mac Helper';
  const plaintext = `bubble_helper_${crypto.randomBytes(24).toString('base64url')}`;
  const tokenHash = hashToken(plaintext);
  const prefix = plaintext.slice(0, 18);
  const createdAt = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await getHelperTokensDocument();
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

export async function revokeHelperToken(id: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await getHelperTokensDocument();
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

export async function authenticateHelperToken(token: string) {
  const tokenHash = hashToken(token);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await getHelperTokensDocument();
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

async function getHelperTokensDocument() {
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
      return getHelperTokensDocument();
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
