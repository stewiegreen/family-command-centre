/**
 * Per-member homescreen widget order.
 * Dashboard should render cards in the order returned by resolveHomescreenOrder().
 * When the user rearranges, call setMyHomescreenOrder with the new string[].
 *
 * IMPORTANT: these ids must exactly match the SectionId keys used in
 * DashboardPage's `sections` record (src/pages/Dashboard.tsx). If you add a
 * new dashboard section, add its id here too, or it will silently fail to
 * render for anyone whose saved order predates it.
 */

/** Stable ids used by the dashboard. Keep in sync with DashboardPage's `sections` object. */
export const HOMESCREEN_WIDGETS = ['stats', 'presence', 'digest', 'events', 'todos', 'choresShop', 'look'] as const;

export type HomescreenWidgetId = (typeof HOMESCREEN_WIDGETS)[number];

/** Default order for anyone who has never rearranged. */
export const DEFAULT_HOMESCREEN_ORDER: string[] = [
  'stats',
  'presence',
  'digest',
  'events',
  'todos',
  'choresShop',
  'look',
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
