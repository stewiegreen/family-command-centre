const THEME_STUDIO_UNLOCK_KEY = 'fcc_theme_studio_unlock';

/** Bridge: shop purchase → Theme Studio before appearance sync settles. */
export function markThemeStudioUnlockedLocally(memberId: string) {
  try {
    sessionStorage.setItem(THEME_STUDIO_UNLOCK_KEY, memberId);
  } catch {
    /* ignore */
  }
}

export function hasLocalThemeStudioUnlock(memberId: string): boolean {
  try {
    return sessionStorage.getItem(THEME_STUDIO_UNLOCK_KEY) === memberId;
  } catch {
    return false;
  }
}
