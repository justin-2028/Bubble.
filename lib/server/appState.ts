import 'server-only';

import { createDefaultExportData } from '../defaultData';
import { cloneExportSchema, normalizeExportSchema } from '../exportSchema';
import { ExportSchema } from '../types';
import { StorageConflictError, readJsonDocument, writeJsonDocument } from './jsonStore';

const APP_STATE_KEY = 'state';

export interface AppStateDocument {
  schemaVersion: 1;
  version: number;
  updatedAt: string;
  data: ExportSchema;
}

export async function getAppStateDocument() {
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
      return getAppStateDocument();
    }
    throw error;
  }
}

export async function replaceAppState(nextState: ExportSchema, baseVersion: number) {
  const { doc, etag } = await getAppStateDocument();
  if (doc.version !== baseVersion) {
    return {
      ok: false as const,
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
      const current = await getAppStateDocument();
      return {
        ok: false as const,
        current: current.doc,
      };
    }
    throw error;
  }
}

export async function mutateAppState(mutator: (current: ExportSchema) => ExportSchema) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, etag } = await getAppStateDocument();
    const currentData = cloneExportSchema(doc.data);
    const nextData = normalizeExportSchema(mutator(currentData), doc.data);

    if (JSON.stringify(nextData) === JSON.stringify(doc.data)) {
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
    }
  }

  throw new Error('Could not update Bubble state after repeated write conflicts');
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
