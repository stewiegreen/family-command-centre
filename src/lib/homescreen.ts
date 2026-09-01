/**
 * Per-member homescreen widget order.
 * Dashboard should render cards in the order returned by resolveHomescreenOrder().
 * When the user rearranges, call setMyHomescreenOrder with the new string[].
 */

/** Stable ids used by the dashboard. Keep in sync with DashboardPage cards. */
export const HOMESCREEN_WIDGETS = [
  'announcement',
  'presence',
  'today',
  'todos',
  'chores',
  'screenTime',
  'shopping',
  'messages',
  'notes',
] as const;

export type HomescreenWidgetId = (typeof HOMESCREEN_WIDGETS)[number];

/** Default order for anyone who has never rearranged. */
export const DEFAULT_HOMESCREEN_ORDER: string[] = [
  'announcement',
  'presence',
  'today',
  'todos',
  'chores',
  'screenTime',
  'shopping',
  'messages',
];

/**
 * Merge a saved order with the current known widgets.
 * - Preserves the user's preferred order for ids they still have
 * - Appends any new widgets that appeared after they last rearranged
 * - Drops ids that no longer exist
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

  // Any brand-new widget not in the default list either
  for (const id of HOMESCREEN_WIDGETS) {
    if (!seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  return ordered;
}
