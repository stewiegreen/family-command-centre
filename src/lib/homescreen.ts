/**
 * Per-member homescreen layout.
 *
 * Layout is a list of ROWS. Each row holds 1 card id (full width) or
 * 2 card ids (share the row, half width each). This is the source of
 * truth -- there is no separate "span" field to keep in sync, so a pair
 * can never drift out of sync with how it's actually drawn.
 *
 * Dragging card A onto card B always means "put A in B's row" (pairing
 * them, bumping out whoever B was paired with, if anyone). Popping a
 * card out (via the toolbar button) always means "give it its own
 * full-width row".
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
  'journal',
  'look',
] as const;

export type HomescreenWidgetId = (typeof HOMESCREEN_WIDGETS)[number];

/** A row is 1 id (full width) or 2 ids (each shares the row, half width). */
export type HomescreenRow = HomescreenWidgetId[];

/**
 * Firestore-safe on-disk shape. Firestore rejects arrays nested directly
 * inside arrays (`string[][]`), so each row is wrapped in an object.
 */
export interface HomescreenRowDoc {
  ids: string[];
}

export function toHomescreenRowDocs(rows: HomescreenRow[]): HomescreenRowDoc[] {
  return rows.map((ids) => ({ ids }));
}

function fromHomescreenRowDocs(docs: HomescreenRowDoc[]): HomescreenRow[] {
  return docs
    .map((d) => (Array.isArray(d?.ids) ? d.ids.filter(isWidgetId) : []))
    .filter((row) => row.length > 0)
    .map((row) => row.slice(0, 2) as HomescreenRow);
}


/** Default: events+todos share a row, chores+shopping share a row. */
export const DEFAULT_HOMESCREEN_ROWS: HomescreenRow[] = [
  ['stats'],
  ['chorequest'],
  ['presence'],
  ['digest'],
  ['events', 'todos'],
  ['chores', 'shopping'],
  ['journal'],
  ['look'],
];

/** @deprecated legacy per-card span shape, kept only for migrating old saved data. */
export interface HomescreenLayoutItem {
  id: string;
  span: 'full' | 'half';
}

export function isWidgetId(id: string): id is HomescreenWidgetId {
  return (HOMESCREEN_WIDGETS as readonly string[]).includes(id);
}

/**
 * Turn a legacy flat "order + span" layout into rows, using the same
 * consecutive-half-pairing rule the old renderer used. Only used once,
 * to migrate a user's previously-saved layout the first time they load
 * the new row-based dashboard.
 */
function rowsFromLegacyLayout(legacy: HomescreenLayoutItem[]): HomescreenRow[] {
  const rows: HomescreenRow[] = [];
  let halfBuf: HomescreenWidgetId[] = [];
  const flush = () => {
    if (halfBuf.length) {
      rows.push(halfBuf);
      halfBuf = [];
    }
  };
  for (const item of legacy) {
    if (!isWidgetId(item.id)) continue;
    if (item.span === 'half') {
      halfBuf.push(item.id);
      if (halfBuf.length >= 2) flush();
    } else {
      flush();
      rows.push([item.id]);
    }
  }
  flush();
  return rows;
}

function rowsFromLegacyOrder(order: string[]): HomescreenRow[] {
  return rowsFromLegacyLayout(
    order
      .filter(isWidgetId)
      .map((id) => ({
        id,
        span:
          id === 'events' || id === 'todos' || id === 'chores' || id === 'shopping'
            ? ('half' as const)
            : ('full' as const),
      })),
  );
}

/**
 * Resolve the row layout to render, preferring the new row-based save,
 * falling back to migrating whatever legacy shape is present, and always
 * appending any known widget the saved data is missing (e.g. a widget
 * added after the user's layout was saved) as its own full-width row.
 */
export function resolveHomescreenRows(
  savedRows?: HomescreenRowDoc[] | null,
  savedLayout?: HomescreenLayoutItem[] | null,
  savedOrder?: string[] | null,
): HomescreenRow[] {
  let rows: HomescreenRow[];

  if (savedRows?.length) {
    rows = fromHomescreenRowDocs(savedRows);
  } else if (savedLayout?.length) {
    rows = rowsFromLegacyLayout(savedLayout);
  } else if (savedOrder?.length) {
    rows = rowsFromLegacyOrder(savedOrder);
  } else {
    rows = [];
  }

  // De-dupe (a card should only ever appear once) and track what's placed.
  const seen = new Set<HomescreenWidgetId>();
  rows = rows
    .map((row) => row.filter((id) => (seen.has(id) ? false : (seen.add(id), true))))
    .filter((row) => row.length > 0);

  for (const def of DEFAULT_HOMESCREEN_ROWS) {
    for (const id of def) {
      if (!seen.has(id)) {
        rows.push([id]);
        seen.add(id);
      }
    }
  }

  return rows;
}

/** Which row (and index within it) a card currently sits in. */
function locate(rows: HomescreenRow[], id: HomescreenWidgetId): { row: number; pos: number } | null {
  for (let r = 0; r < rows.length; r++) {
    const pos = rows[r]!.indexOf(id);
    if (pos >= 0) return { row: r, pos };
  }
  return null;
}

/**
 * Drop `fromId` onto `toId`:
 * - If `toId`'s row has a free slot (currently solo), `fromId` joins it --
 *   the two cards now share a row.
 * - If `toId`'s row is already full (a pair), `fromId` is inserted as its
 *   own new full-width row right next to it (a normal reorder).
 * `fromId` is always removed from its old spot first; if that empties a
 * shared row, the remaining card becomes a solo full-width row.
 */
export function pairOrReorder(
  rows: HomescreenRow[],
  fromId: string,
  toId: string,
): HomescreenRow[] {
  if (fromId === toId || !isWidgetId(fromId) || !isWidgetId(toId)) return rows;
  const from = locate(rows, fromId);
  const to = locate(rows, toId);
  if (!from || !to) return rows;

  // Remove fromId from its current row.
  const next = rows.map((row) => row.slice()) as HomescreenRow[];
  const oldRow = next[from.row]!;
  oldRow.splice(from.pos, 1);
  if (oldRow.length === 0) next.splice(from.row, 1);

  // Re-locate the target row (index may have shifted if we removed a row before it).
  const toRow2 = locate(next, toId)!;
  const targetRow = next[toRow2.row]!;

  if (targetRow.length < 2) {
    targetRow.push(fromId);
  } else {
    next.splice(toRow2.row + 1, 0, [fromId]);
  }

  return next;
}

/** Pop a card out to its own full-width row. Its old row partner (if any) also becomes solo. */
export function popOutToFullRow(rows: HomescreenRow[], id: string): HomescreenRow[] {
  if (!isWidgetId(id)) return rows;
  const at = locate(rows, id);
  if (!at) return rows;
  const row = rows[at.row]!;
  if (row.length < 2) return rows; // already full width

  const partner = row.find((x) => x !== id)!;
  const next = rows.map((r) => r.slice()) as HomescreenRow[];
  next.splice(at.row, 1, [partner], [id]);
  return next;
}

export function isPaired(rows: HomescreenRow[], id: string): boolean {
  const at = isWidgetId(id) ? locate(rows, id) : null;
  return !!at && rows[at.row]!.length === 2;
}

/**
 * Rows with any hidden widget ids removed, and any row left empty as a
 * result dropped entirely. Positions/pairings of the visible cards are
 * otherwise preserved exactly as stored.
 */
export function visibleHomescreenRows(
  rows: HomescreenRow[],
  hidden: readonly string[],
): HomescreenRow[] {
  if (!hidden.length) return rows;
  const hiddenSet = new Set(hidden);
  return rows
    .map((row) => row.filter((id) => !hiddenSet.has(id)))
    .filter((row) => row.length > 0);
}
