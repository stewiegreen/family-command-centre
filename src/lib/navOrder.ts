import type { ViewId } from '../types';

/** Sidebar pages (settings stays pinned at the bottom, not in this list). */
export const DEFAULT_NAV_ORDER: ViewId[] = [
  'dashboard',
  'calendar',
  'todos',
  'chores',
  'school',
  'shopping',
  'recipes',
  'notes',
  'journal',
  'messages',
  'media',
  'themestudio',
];

const NAV_SET = new Set<string>(DEFAULT_NAV_ORDER);

export function isNavViewId(id: string): id is ViewId {
  return NAV_SET.has(id);
}

/**
 * Merge a saved per-member order with the full catalog:
 * - keep saved ids that still exist, in that order
 * - append any new pages the user has never ordered
 * - drop unknown ids
 */
export function resolveNavOrder(saved?: string[] | null): ViewId[] {
  const seen = new Set<string>();
  const out: ViewId[] = [];
  for (const id of saved || []) {
    if (!isNavViewId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of DEFAULT_NAV_ORDER) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function moveNavItem(order: ViewId[], id: ViewId, dir: -1 | 1): ViewId[] {
  const i = order.indexOf(id);
  if (i < 0) return order;
  const j = i + dir;
  if (j < 0 || j >= order.length) return order;
  const next = order.slice();
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}
