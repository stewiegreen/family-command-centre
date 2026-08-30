import type { FamilyData, FirebaseConfig } from '../types';
import { DEFAULT_DATA, migratePayload } from './defaults';
import { BUILT_IN_FIREBASE_CONFIG, HAS_BUILT_IN_CONFIG } from './firebaseConfig';

export const STORAGE_KEY = 'fcc-v1';
export const CLOUD_CFG_KEY = 'fcc-cloud-cfg';
export const FAMILY_ID_KEY = 'fcc-family-id';
export const CURRENT_USER_KEY = 'fcc-current-user';

export function loadLocalData(): FamilyData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    return migratePayload(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

export function saveLocalData(data: FamilyData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Prefer built-in config so every device works without pasting JSON. */
export function loadCloudConfig(): FirebaseConfig | null {
  if (HAS_BUILT_IN_CONFIG) return BUILT_IN_FIREBASE_CONFIG;
  try {
    const raw = localStorage.getItem(CLOUD_CFG_KEY);
    return raw ? (JSON.parse(raw) as FirebaseConfig) : null;
  } catch {
    return null;
  }
}

export function saveCloudConfig(cfg: FirebaseConfig | null): void {
  // Built-in config is compile-time; don't rely on localStorage for it.
  if (HAS_BUILT_IN_CONFIG) return;
  if (cfg) localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CLOUD_CFG_KEY);
}

export { HAS_BUILT_IN_CONFIG };
