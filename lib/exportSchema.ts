import { defaultSystemControls } from './defaultData';
import { ExportSchema, SystemControls } from './types';

export function cloneExportSchema(data: ExportSchema): ExportSchema {
  return JSON.parse(JSON.stringify(data)) as ExportSchema;
}

export function normalizeExportSchema(input: any, fallback?: Partial<ExportSchema>): ExportSchema {
  const categories = Array.isArray(input?.categories)
    ? input.categories.map((c: any) => ({
        ...c,
        description: typeof c?.description === 'string' ? c.description : '',
      }))
    : Array.isArray(fallback?.categories)
      ? fallback.categories
      : [];

  const people = Array.isArray(input?.people)
    ? input.people.map((p: any) => ({
        ...p,
        labelIds: Array.isArray(p?.labelIds) ? p.labelIds : [],
        starred: typeof p?.starred === 'boolean' ? p.starred : false,
        duplicateGroupId: typeof p?.duplicateGroupId === 'string' ? p.duplicateGroupId : undefined,
        archivedAt: typeof p?.archivedAt === 'string' ? p.archivedAt : undefined,
        archivedFromCategoryId:
          typeof p?.archivedFromCategoryId === 'string' ? p.archivedFromCategoryId : undefined,
        archivedOrder: typeof p?.archivedOrder === 'number' ? p.archivedOrder : undefined,
      }))
    : Array.isArray(fallback?.people)
      ? fallback.people
      : [];

  const labels = Array.isArray(input?.labels)
    ? input.labels
    : Array.isArray(fallback?.labels)
      ? fallback.labels
      : [];

  const fallbackControls = fallback?.systemControls ?? defaultSystemControls;
  const systemControlsInput = input?.systemControls;
  const systemControls: SystemControls =
    systemControlsInput && typeof systemControlsInput === 'object'
      ? {
          multiSelectHotkeysEnabled:
            typeof systemControlsInput.multiSelectHotkeysEnabled === 'boolean'
              ? systemControlsInput.multiSelectHotkeysEnabled
              : fallbackControls.multiSelectHotkeysEnabled,
          multiSelectUpdateToNowKey:
            typeof systemControlsInput.multiSelectUpdateToNowKey === 'string'
              ? systemControlsInput.multiSelectUpdateToNowKey
              : null,
          multiSelectArchiveKey:
            typeof systemControlsInput.multiSelectArchiveKey === 'string'
              ? systemControlsInput.multiSelectArchiveKey
              : null,
          multiSelectDeleteKey:
            typeof systemControlsInput.multiSelectDeleteKey === 'string'
              ? systemControlsInput.multiSelectDeleteKey
              : null,
        }
      : { ...fallbackControls };

  return {
    version: typeof input?.version === 'number' ? input.version : fallback?.version ?? 2,
    categories,
    people,
    labels,
    systemControls,
  };
}
