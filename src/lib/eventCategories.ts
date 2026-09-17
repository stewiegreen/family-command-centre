/** Fixed event categories for calendar + CalDAV CATEGORIES. */

export const EVENT_CATEGORY_IDS = [
  'general',
  'school',
  'sport',
  'medical',
  'family',
  'travel',
  'birthday',
  'chore',
  'other',
] as const;

export type EventCategory = (typeof EVENT_CATEGORY_IDS)[number];

export const EVENT_CATEGORY_META: Record<
  EventCategory,
  { label: string; /** Accent for chips when not using member colour alone */ accent: string; emoji: string }
> = {
  general: { label: 'General', accent: '#6366f1', emoji: '📌' },
  school: { label: 'School', accent: '#3b82f6', emoji: '📚' },
  sport: { label: 'Sport', accent: '#10b981', emoji: '⚽' },
  medical: { label: 'Medical', accent: '#ef4444', emoji: '🩺' },
  family: { label: 'Family', accent: '#a855f7', emoji: '🏠' },
  travel: { label: 'Travel', accent: '#0ea5e9', emoji: '✈️' },
  birthday: { label: 'Birthday', accent: '#f59e0b', emoji: '🎂' },
  chore: { label: 'Chore', accent: '#84cc16', emoji: '🧹' },
  other: { label: 'Other', accent: '#94a3b8', emoji: '•' },
};

export function eventCategoryOf(raw: string | undefined | null): EventCategory {
  if (raw && (EVENT_CATEGORY_IDS as readonly string[]).includes(raw)) {
    return raw as EventCategory;
  }
  return 'general';
}

/** ICS CATEGORIES value (Apple / CalDAV friendly). */
export function categoryToIcs(cat: EventCategory | undefined): string | undefined {
  if (!cat || cat === 'general') return undefined;
  return EVENT_CATEGORY_META[cat].label;
}

export function categoryFromIcs(raw: string | undefined): EventCategory | undefined {
  if (!raw) return undefined;
  // May be comma-separated; take first
  const first = raw.split(',')[0]?.trim().toLowerCase() || '';
  for (const id of EVENT_CATEGORY_IDS) {
    if (id === first) return id;
    if (EVENT_CATEGORY_META[id].label.toLowerCase() === first) return id;
  }
  return 'other';
}
