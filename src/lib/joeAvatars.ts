/**
 * G.I. Joe (hero) head portraits split from a fan icon sheet.
 * Files: /avatars/joe_{row}_{col}.png  (17 rows × 13 cols, last cell is logo → 220 faces)
 * Portrait ids: "joe_01_01" … "joe_17_12"
 */

export const JOE_ROW_COUNT = 17;
export const JOE_COL_COUNT = 13;

/** Last row is short (logo cell omitted). */
export function joeColsForRow(row: number): number {
  return row === JOE_ROW_COUNT ? JOE_COL_COUNT - 1 : JOE_COL_COUNT;
}

export const JOE_PACK_LABELS: string[] = [
  'Breaker',
  'Flagg',
  'Mutt',
  'Shipwreck',
  'Slipstream',
  'Sci-Fi',
  'Chuckles',
  'Starduster',
  'Storm Shadow',
  'Recoil',
  'Rapid Fire',
  'Heavy Duty',
  'Dojo',
  'Ice Cream',
  'Hacker',
  'Talbot',
  'Red Star',
];

export function joePortraitPath(id: string): string {
  const bare = id.startsWith('joe_') ? id.slice(4) : id;
  return `/avatars/joe_${bare}.png`;
}

export function joePortraitId(row: number, col: number): string {
  return `joe_${String(row).padStart(2, '0')}_${String(col).padStart(2, '0')}`;
}

export function joeIdsForPack(row: number): string[] {
  const out: string[] = [];
  const cols = joeColsForRow(row);
  for (let c = 1; c <= cols; c++) {
    out.push(joePortraitId(row, c));
  }
  return out;
}

export function isJoePortraitId(id: string | null | undefined): boolean {
  if (!id) return false;
  const m = /^joe_(\d{2})_(\d{2})$/.exec(id);
  if (!m) return false;
  const r = parseInt(m[1], 10);
  const c = parseInt(m[2], 10);
  if (r < 1 || r > JOE_ROW_COUNT) return false;
  return c >= 1 && c <= joeColsForRow(r);
}

export function joePackLabel(row: number): string {
  return JOE_PACK_LABELS[row - 1] || `Set ${row}`;
}
