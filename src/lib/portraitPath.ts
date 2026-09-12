import { isRosterPortraitId, rosterPortraitPath } from './rosterAvatars';
import { isCobraPortraitId, cobraPortraitPath } from './cobraAvatars';
import { isFanPortraitId, fanPortraitPath } from './fanAvatars';

/** Resolve a stored avatarPortraitId to a public image URL, or null. */
export function portraitSrc(id: string | null | undefined): string | null {
  if (!id) return null;
  if (isCobraPortraitId(id)) return cobraPortraitPath(id);
  if (isFanPortraitId(id)) return fanPortraitPath(id);
  if (isRosterPortraitId(id)) return rosterPortraitPath(id);
  return null;
}

export function isAnyPortraitId(id: string | null | undefined): boolean {
  return isCobraPortraitId(id) || isFanPortraitId(id) || isRosterPortraitId(id);
}
