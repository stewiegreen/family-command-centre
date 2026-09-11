/**
 * Built-in roster portrait avatars (200 squares).
 * Files: /avatars/portrait_{pack}_{idx}.png  (public/avatars/)
 * 10 packs × 20 faces for browsing without a 200-tile wall.
 */

export const ROSTER_PACK_SIZE = 20;
export const ROSTER_PACK_COUNT = 10;

export function rosterPortraitPath(id: string): string {
  return `/avatars/portrait_${id}.png`;
}

export function rosterPackLabel(pack: number): string {
  return `Set ${pack}`;
}

export function allRosterPortraitIds(): string[] {
  const out: string[] = [];
  for (let p = 1; p <= ROSTER_PACK_COUNT; p++) {
    for (let i = 1; i <= ROSTER_PACK_SIZE; i++) {
      out.push(`${String(p).padStart(2, '0')}_${String(i).padStart(2, '0')}`);
    }
  }
  return out;
}

export function rosterIdsForPack(pack: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= ROSTER_PACK_SIZE; i++) {
    out.push(`${String(pack).padStart(2, '0')}_${String(i).padStart(2, '0')}`);
  }
  return out;
}

export function isRosterPortraitId(id: string | null | undefined): boolean {
  if (!id || !/^\d{2}_\d{2}$/.test(id)) return false;
  const [p, i] = id.split('_').map((x) => parseInt(x, 10));
  return p >= 1 && p <= ROSTER_PACK_COUNT && i >= 1 && i <= ROSTER_PACK_SIZE;
}
