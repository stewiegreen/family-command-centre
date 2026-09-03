/** Preset life tags for family notes — filter chips on the Notes page. */
export const NOTE_TAG_PRESETS = [
  'School',
  'Health',
  'Travel',
  'Money',
  'House',
  'Kids',
  'Work',
  'Emergency',
] as const;

export type NoteTagPreset = (typeof NOTE_TAG_PRESETS)[number];

/** Days without update before a pinned/home note is considered stale. */
export const NOTE_STALE_DAYS = 90;

export function isNoteStale(updatedAt: string, now = Date.now()): boolean {
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > NOTE_STALE_DAYS * 86_400_000;
}
