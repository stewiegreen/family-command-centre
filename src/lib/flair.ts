/** Cosmetics kids unlock via the ChoreQuest shop. */

export const NAME_FLAIR_MAX = 24;

/** Shape choices for avatar frame. */
export type AvatarFlairShape = 'circle' | 'pixel';

export const AVATAR_FLAIR_SHAPES: { id: AvatarFlairShape; label: string; preview: string }[] = [
  { id: 'circle', label: 'Circle', preview: '●' },
  { id: 'pixel', label: 'Pixel', preview: '■' },
];

/** Wide colour palette for the frame ring (not the face fill). */
export const AVATAR_FLAIR_COLORS: { id: string; label: string; hex: string }[] = [
  { id: 'off', label: 'Off', hex: '' },
  { id: 'gold', label: 'Gold', hex: '#fbbf24' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'fuchsia', label: 'Fuchsia', hex: '#d946ef' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'teal', label: 'Teal', hex: '#14b8a6' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'lime', label: 'Lime', hex: '#84cc16' },
  { id: 'yellow', label: 'Yellow', hex: '#eab308' },
  { id: 'white', label: 'White', hex: '#f8fafc' },
  { id: 'silver', label: 'Silver', hex: '#94a3b8' },
  { id: 'black', label: 'Black', hex: '#0f172a' },
];

/** Sanitize free-text name flair. Real profile name is never changed. */
export function sanitizeNameFlair(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_FLAIR_MAX);
}

export function nameFlairLabel(text?: string | null): string | null {
  const t = (text || '').trim();
  return t ? t : null;
}

export function avatarFlairShapeClass(shape?: string): string {
  if (shape === 'pixel') return '!rounded-md';
  return '!rounded-full';
}

/** Inline ring colour via box-shadow so it works with any hex. */
export function avatarFlairBoxShadow(colorHex?: string): string | undefined {
  if (!colorHex) return undefined;
  return `0 0 0 3px ${colorHex}, 0 0 14px ${colorHex}aa`;
}
