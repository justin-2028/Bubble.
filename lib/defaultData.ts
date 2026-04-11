import { Category, ExportSchema, Person, SystemControls } from './types';
import { svgAvatarDataUrl } from './avatar';
import { uid } from './utils';

export const defaultSystemControls: SystemControls = {
  multiSelectHotkeysEnabled: false,
  multiSelectUpdateToNowKey: null,
  multiSelectArchiveKey: null,
  multiSelectDeleteKey: null,
};

export function createExampleCategories(): Category[] {
  return [
    {
      id: uid('cat_'),
      name: 'Family',
      timeLimitValue: 14,
      timeLimitUnit: 'days',
      sortOrder: 0,
      gradientColors: ['#ffffff', '#f8f8f8', '#f0f0f0'],
    },
    {
      id: uid('cat_'),
      name: 'Mentors',
      timeLimitValue: 1,
      timeLimitUnit: 'months',
      sortOrder: 1,
      gradientColors: ['#ffffff', '#f6f6f6', '#ececec'],
    },
    {
      id: uid('cat_'),
      name: 'Friends',
      timeLimitValue: 21,
      timeLimitUnit: 'days',
      sortOrder: 2,
      gradientColors: ['#ffffff', '#f7f7f7', '#ededed'],
    },
  ];
}

function createSamplePeople(categories: Category[]): Person[] {
  const [c1, c2, c3] = categories;
  const mk = (fullName: string, categoryId: string, daysAgo: number, yPosition: number): Person => ({
    id: uid('p_'),
    fullName,
    categoryId,
    context: '',
    lastInteraction: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    interactionCount: 0,
    yPosition,
    image: svgAvatarDataUrl(fullName),
    labelIds: [],
    starred: false,
  });

  return [
    mk('Alice Bubble', c1.id, 3, 20),
    mk('Bob Bubble', c1.id, 11, 45),
    mk('Dr. Patel', c2.id, 20, 30),
    mk('Prof. Nguyen', c2.id, 45, 60),
    mk('Ethan Wright', c3.id, 2, 25),
    mk('Maya Chen', c3.id, 7, 50),
    mk('Ravi Kumar', c3.id, 25, 65),
    mk('Sara Kim', c3.id, 12, 80),
    mk('Tom Bubble', c1.id, 28, 55),
  ];
}

export function createDefaultExportData(): ExportSchema {
  const categories = createExampleCategories();
  return {
    version: 2,
    categories,
    people: createSamplePeople(categories),
    labels: [],
    systemControls: { ...defaultSystemControls },
  };
}
