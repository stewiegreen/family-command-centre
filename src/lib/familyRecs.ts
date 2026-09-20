/** Session hand-off when a home-card recommendation is opened. */

export const REC_OPEN_KEY = 'greenhq-open-family-rec';

export type PendingRecOpen = {
  source: 'comic' | 'emby';
  id: string;
};

export function stashRecOpen(pending: PendingRecOpen): void {
  try {
    sessionStorage.setItem(REC_OPEN_KEY, JSON.stringify(pending));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Consume a pending open only if it matches `source` (leave the other kind in place). */
export function takeRecOpen(source: 'comic' | 'emby'): PendingRecOpen | null {
  try {
    const raw = sessionStorage.getItem(REC_OPEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRecOpen;
    if (!parsed || parsed.source !== source || !parsed.id) return null;
    sessionStorage.removeItem(REC_OPEN_KEY);
    return parsed;
  } catch {
    return null;
  }
}
