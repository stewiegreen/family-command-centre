import { isRosterPortraitId, rosterPortraitPath } from './rosterAvatars';
import { isCobraPortraitId, cobraPortraitPath } from './cobraAvatars';

/** Resolve a stored avatarPortraitId to a public image URL, or null. */
export function portraitSrc(id: string | null | undefined): string | null {
  if (!id) return null;
  if (isCobraPortraitId(id)) return cobraPortraitPath(id);
  if (isRosterPortraitId(id)) return rosterPortraitPath(id);
  return null;
}

export function isAnyPortraitId(id: string | null | undefined): boolean {
  return isCobraPortraitId(id) || isRosterPortraitId(id);
}
