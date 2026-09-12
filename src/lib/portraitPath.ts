import { isRosterPortraitId, rosterPortraitPath } from './rosterAvatars';
import { isCobraPortraitId, cobraPortraitPath } from './cobraAvatars';
import { isFanPortraitId, fanPortraitPath } from './fanAvatars';
import { isJoePortraitId, joePortraitPath } from './joeAvatars';

/** Resolve a stored avatarPortraitId to a public image URL, or null. */
export function portraitSrc(id: string | null | undefined): string | null {
  if (!id) return null;
  if (isCobraPortraitId(id)) return cobraPortraitPath(id);
  if (isJoePortraitId(id)) return joePortraitPath(id);
  if (isFanPortraitId(id)) return fanPortraitPath(id);
  if (isRosterPortraitId(id)) return rosterPortraitPath(id);
  return null;
}

export function isAnyPortraitId(id: string | null | undefined): boolean {
  return (
    isCobraPortraitId(id) ||
    isJoePortraitId(id) ||
    isFanPortraitId(id) ||
    isRosterPortraitId(id)
  );
}
