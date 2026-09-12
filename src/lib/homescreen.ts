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
  'school',
  'weather',
  'screentimer',
  'look',
  'pictureframe',
  'pictureframe2',
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
  ['weather'],
  ['screentimer'],
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

  // Append any known widget missing from the saved layout (new cards after
  // the user first saved their order). Prefer default-row order, then any
  // remaining HOMESCREEN_WIDGETS entries.
  for (const def of DEFAULT_HOMESCREEN_ROWS) {
    for (const id of def) {
      if (!seen.has(id)) {
        rows.push([id]);
        seen.add(id);
      }
    }
  }
  for (const id of HOMESCREEN_WIDGETS) {
    if (!seen.has(id)) {
      rows.push([id]);
      seen.add(id);
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
 * Where a dragged card is being dropped.
 * - beside: left/right half of a target card (share or re-pair that row)
 * - gap: insert a new full-width solo row at this index (0 = top)
 */
export type HomescreenDropPlacement =
  | { kind: 'beside'; targetId: string; side: 'left' | 'right' }
  /** New solo row at the very top */
  | { kind: 'gapStart' }
  /** New solo row after the row that currently contains afterId */
  | { kind: 'gapAfter'; afterId: string };

/** Remove a widget from rows; empty rows are dropped. */
function removeWidget(rows: HomescreenRow[], id: HomescreenWidgetId): HomescreenRow[] {
  return rows
    .map((row) => row.filter((x) => x !== id) as HomescreenRow)
    .filter((row) => row.length > 0);
}

/**
 * Apply a position-aware homescreen drop.
 *
 * Beside rules:
 * - Solo target → pair on the chosen side.
 * - Already paired → insert on that side of the target; the card furthest from
 *   the insertion is kicked to its own full-width row (before if it was left,
 *   after if it was right).
 *
 * Gap rules:
 * - Drag between rows / above top / below bottom → solo full-width row there.
 */
export function applyHomescreenDrop(
  rows: HomescreenRow[],
  fromId: string,
  placement: HomescreenDropPlacement,
): HomescreenRow[] {
  if (!isWidgetId(fromId)) return rows;

  if (placement.kind === 'gapStart') {
    const next = removeWidget(rows, fromId);
    next.unshift([fromId]);
    return next;
  }

  if (placement.kind === 'gapAfter') {
    const from = locate(rows, fromId);
    const next = removeWidget(rows, fromId);
    if (!isWidgetId(placement.afterId)) {
      next.push([fromId]);
      return next;
    }
    const loc = locate(next, placement.afterId);
    if (loc) {
      next.splice(loc.row + 1, 0, [fromId]);
      return next;
    }
    // Anchor was the dragged card itself (gap under its old row). Insert at the
    // index that row occupied so we land *after* the previous row, not at end.
    if (from) {
      const idx = Math.max(0, Math.min(from.row, next.length));
      next.splice(idx, 0, [fromId]);
      return next;
    }
    next.push([fromId]);
    return next;
  }

  const { targetId, side } = placement;
  if (fromId === targetId || !isWidgetId(targetId)) return rows;
  if (!locate(rows, fromId) || !locate(rows, targetId)) return rows;

  const next = removeWidget(rows, fromId);
  const to = locate(next, targetId);
  if (!to) return rows;

  const rowIdx = to.row;
  const row = next[rowIdx]!.slice() as HomescreenWidgetId[];

  // fromId always stays with targetId on the chosen side.
  // Solo row → just pair. Full row → the other card is kicked to its own row.
  const partner = row.find((x) => x !== targetId) || null;
  const paired: HomescreenRow =
    side === 'left' ? [fromId, targetId] : [targetId, fromId];

  if (!partner) {
    next[rowIdx] = paired;
    return next;
  }

  const partnerWasLeft = row.indexOf(partner) < row.indexOf(targetId);
  if (partnerWasLeft) {
    next.splice(rowIdx, 1, [partner], paired);
  } else {
    next.splice(rowIdx, 1, paired, [partner]);
  }
  return next;
}

/**
 * @deprecated Prefer applyHomescreenDrop. Kept for the "share row with…" menu:
 * joins fromId into toId's row on the right (or reorders if already paired).
 */
export function pairOrReorder(
  rows: HomescreenRow[],
  fromId: string,
  toId: string,
): HomescreenRow[] {
  return applyHomescreenDrop(rows, fromId, {
    kind: 'beside',
    targetId: toId,
    side: 'right',
  });
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
