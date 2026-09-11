/**
 * G.I. Joe / Cobra head portraits split from a fan icon sheet.
 * Files: /avatars/cobra_{row}_{col}.png  (14 rows × 13 cols = 182)
 * Portrait ids stored as "cobra_01_01" so they never collide with roster ids.
 */

export const COBRA_ROW_COUNT = 14;
export const COBRA_COL_COUNT = 13;

export const COBRA_PACK_LABELS: string[] = [
  'Command',
  'Mercs',
  'Tech',
  'Vipers I',
  'Vipers II',
  'Specialists',
  'Heavy',
  'Shadow',
  'Night',
  'Elite',
  'Ops',
  'Venom',
  'Jungle',
  'Dreadnoks',
];

export function cobraPortraitPath(id: string): string {
  const bare = id.startsWith('cobra_') ? id.slice(6) : id;
  return `/avatars/cobra_${bare}.png`;
}

export function cobraPortraitId(row: number, col: number): string {
  return `cobra_${String(row).padStart(2, '0')}_${String(col).padStart(2, '0')}`;
}

export function cobraIdsForPack(row: number): string[] {
  const out: string[] = [];
  for (let c = 1; c <= COBRA_COL_COUNT; c++) {
    out.push(cobraPortraitId(row, c));
  }
  return out;
}

export function isCobraPortraitId(id: string | null | undefined): boolean {
  if (!id) return false;
  const m = /^cobra_(\d{2})_(\d{2})$/.exec(id);
  if (!m) return false;
  const r = parseInt(m[1], 10);
  const c = parseInt(m[2], 10);
  return r >= 1 && r <= COBRA_ROW_COUNT && c >= 1 && c <= COBRA_COL_COUNT;
}

export function cobraPackLabel(row: number): string {
  return COBRA_PACK_LABELS[row - 1] || `Set ${row}`;
}
