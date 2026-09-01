/**
 * Per-member homescreen section order.
 * Dashboard renders sections in the order returned by resolveHomescreenOrder().
 * On rearrange, call setMyHomescreenOrder with the new string[].
 */

/** Matches SectionId in Dashboard.tsx */
export const HOMESCREEN_WIDGETS = [
  'stats',
  'chorequest',
  'presence',
  'digest',
  'events',
  'todos',
  'choresShop',
  'look',
] as const;

export type HomescreenWidgetId = (typeof HOMESCREEN_WIDGETS)[number];

/** Default order for anyone who has never rearranged. */
export const DEFAULT_HOMESCREEN_ORDER: string[] = [
  'stats',
  'chorequest',
  'presence',
  'digest',
  'events',
  'todos',
  'choresShop',
  'look',
];

/**
 * Merge a saved order with the current known sections.
 * Preserves the user's preferred order, appends any new sections, drops unknowns.
 */
export function resolveHomescreenOrder(saved?: string[] | null): string[] {
  const known = new Set<string>(HOMESCREEN_WIDGETS);
  const ordered: string[] = [];
  const seen = new Set<string>();

  if (saved?.length) {
    for (const id of saved) {
      if (known.has(id) && !seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
  }

  for (const id of DEFAULT_HOMESCREEN_ORDER) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  for (const id of HOMESCREEN_WIDGETS) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  return ordered;
}
