import { ExportSchema } from './types';
import { isClient } from './utils';

const STORAGE_KEY = 'bubble-store-v1';

export function save(data: ExportSchema) {
  if (!isClient()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function load(): ExportSchema | null {
  if (!isClient()) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clear() {
  if (!isClient()) return;
  localStorage.removeItem(STORAGE_KEY);
}

