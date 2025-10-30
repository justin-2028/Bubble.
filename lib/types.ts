export type TimeUnit = 'days' | 'months';

export interface Category {
  id: string;
  name: string;
  timeLimitValue: number;
  timeLimitUnit: TimeUnit;
  sortOrder: number;
  gradientColors: string[]; // used to vary white gradient subtly
}

export interface Person {
  id: string;
  fullName: string;
  categoryId: string;
  context: string;
  lastInteraction: string; // ISO string for localStorage
  image?: string; // data URL or remote URL
  yPosition: number; // 0 - 100
}

export interface ExportSchema {
  version: number;
  categories: Category[];
  people: Person[];
}

