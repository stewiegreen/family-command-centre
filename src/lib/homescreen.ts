/**
 * Per-member homescreen section order + width (full | half).
 */

export const HOMESCREEN_WIDGETS = [
  'stats',
  'chorequest',
  'presence',
  'digest',
  'events',
  'todos',
  'chores',
  'shopping',
  'look',
] as const;

export type HomescreenWidgetId = (typeof HOMESCREEN_WIDGETS)[number];
export type HomescreenSpan = 'full' | 'half';

export interface HomescreenLayoutItem {
  id: HomescreenWidgetId;
  span: HomescreenSpan;
}

/** Default: events + todos share a row; everything else full width. */
export const DEFAULT_HOMESCREEN_LAYOUT: HomescreenLayoutItem[] = [
  { id: 'stats', span: 'full' },
  { id: 'chorequest', span: 'full' },
  { id: 'presence', span: 'full' },
  { id: 'digest', span: 'full' },
  { id: 'events', span: 'half' },
  { id: 'todos', span: 'half' },
  { id: 'chores', span: 'half' },
  { id: 'shopping', span: 'half' },
  { id: 'look', span: 'full' },
];

/** @deprecated flat order only — kept for migrate */
export const DEFAULT_HOMESCREEN_ORDER: string[] = DEFAULT_HOMESCREEN_LAYOUT.map((x) => x.id);

export function isWidgetId(id: string): id is HomescreenWidgetId {
  return (HOMESCREEN_WIDGETS as readonly string[]).includes(id);
}

/**
 * Resolve layout from saved layout and/or legacy order.
 * Ensures every known widget appears exactly once.
 */
export function resolveHomescreenLayout(
  savedLayout?: HomescreenLayoutItem[] | null,
  savedOrder?: string[] | null,
): HomescreenLayoutItem[] {
  const known = new Set<string>(HOMESCREEN_WIDGETS);
  const result: HomescreenLayoutItem[] = [];
  const seen = new Set<string>();

  const push = (id: string, span: HomescreenSpan) => {
    if (!known.has(id) || seen.has(id)) return;
    result.push({ id: id as HomescreenWidgetId, span });
    seen.add(id);
  };

  if (savedLayout?.length) {
    for (const item of savedLayout) {
      if (!item?.id) continue;
      const span: HomescreenSpan = item.span === 'half' ? 'half' : 'full';
      if (item.id === 'choresShop') {
        push('chores', span === 'full' ? 'half' : span);
        push('shopping', span === 'full' ? 'half' : span);
      } else {
        push(item.id, span);
      }
    }
  } else if (savedOrder?.length) {
    for (const id of savedOrder) {
      if (id === 'choresShop') {
        push('chores', 'half');
        push('shopping', 'half');
        continue;
      }
      const span: HomescreenSpan =
        id === 'events' || id === 'todos' || id === 'chores' || id === 'shopping' ? 'half' : 'full';
      push(id, span);
    }
  }

  for (const def of DEFAULT_HOMESCREEN_LAYOUT) {
    if (!seen.has(def.id)) push(def.id, def.span);
  }

  return result;
}

/** Legacy helper used by older callers. */
export function resolveHomescreenOrder(saved?: string[] | null): string[] {
  return resolveHomescreenLayout(null, saved).map((x) => x.id);
}

/** Pack sequential layout items into visual rows (1–2 cells). */
export function packHomescreenRows(
  layout: HomescreenLayoutItem[],
): HomescreenLayoutItem[][] {
  const rows: HomescreenLayoutItem[][] = [];
  let halfBuf: HomescreenLayoutItem[] = [];

  const flushHalf = () => {
    if (halfBuf.length) {
      rows.push(halfBuf);
      halfBuf = [];
    }
  };

  for (const item of layout) {
    if (item.span === 'full') {
      flushHalf();
      rows.push([item]);
    } else {
      halfBuf.push(item);
      if (halfBuf.length >= 2) flushHalf();
    }
  }
  flushHalf();
  return rows;
}

export function reorderLayout(
  layout: HomescreenLayoutItem[],
  fromId: string,
  toId: string,
): HomescreenLayoutItem[] {
  if (fromId === toId) return layout;
  const next = [...layout];
  const from = next.findIndex((x) => x.id === fromId);
  const to = next.findIndex((x) => x.id === toId);
  if (from < 0 || to < 0) return layout;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function toggleSpan(
  layout: HomescreenLayoutItem[],
  id: string,
): HomescreenLayoutItem[] {
  return layout.map((x) =>
    x.id === id ? { ...x, span: x.span === 'full' ? 'half' : 'full' } : x,
  );
}
