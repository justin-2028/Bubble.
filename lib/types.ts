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
  image?: string; // data URL or remote URL
  yPosition: number; // 0 - 100
  duplicateGroupId?: string; // links duplicates across categories
  labelIds?: string[]; // ordered
  starred?: boolean;
  archivedAt?: string; // ISO string when archived
  archivedFromCategoryId?: string; // last category before archive
}

export interface ExportSchema {
  version: number;
  categories: Category[];
  people: Person[];
  labels?: Label[];
}
