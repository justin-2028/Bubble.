export type TimeUnit = 'days' | 'months';

export interface Category {
  id: string;
  name: string;
  description?: string;
  timeLimitValue: number;
  timeLimitUnit: TimeUnit;
  sortOrder: number;
  gradientColors: string[]; // used to vary white gradient subtly
}

export interface Label {
  id: string;
  name: string;
  color: string; // hex, e.g. "#ff0000"
}

export interface Person {
  id: string;
  fullName: string;
  categoryId: string;
  context: string;
  lastInteraction: string; // ISO string for localStorage
  interactionCount?: number; // increments when lastInteraction moves closer to now
  image?: string; // data URL or remote URL
  yPosition: number; // 0 - 100
  duplicateGroupId?: string; // links duplicates across categories
  labelIds?: string[]; // ordered
  starred?: boolean;
  archivedAt?: string; // ISO string when archived
  archivedFromCategoryId?: string; // last category before archive
  archivedOrder?: number; // manual ordering within Archive
}

export type Keybind = string | null;

export interface SystemControls {
  multiSelectHotkeysEnabled: boolean;
  multiSelectUpdateToNowKey: Keybind;
  multiSelectArchiveKey: Keybind;
  multiSelectDeleteKey: Keybind;
}

export interface ExportSchema {
  version: number;
  categories: Category[];
  people: Person[];
  labels?: Label[];
  systemControls?: SystemControls;
}
