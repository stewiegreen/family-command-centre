/**
 * Fan portrait packs: Nintendo, Spy×Family, One Piece.
 * Files: /avatars/{ntd|spy|op}_{NN}.png
 * Ids stored as "ntd_01" / "spy_03" / "op_12" so they never collide with roster/cobra.
 */

export type FanPackId = 'ntd' | 'spy' | 'op';

export const FAN_PACKS: {
  id: FanPackId;
  label: string;
  count: number;
}[] = [
  { id: 'ntd', label: 'Nintendo', count: 26 },
  { id: 'spy', label: 'Spy×Family', count: 15 },
  { id: 'op', label: 'One Piece', count: 17 },
];

export function fanPortraitPath(id: string): string {
  return `/avatars/${id}.png`;
}

export function fanPortraitId(pack: FanPackId, index: number): string {
  return `${pack}_${String(index).padStart(2, '0')}`;
}

export function fanIdsForPack(pack: FanPackId): string[] {
  const meta = FAN_PACKS.find((p) => p.id === pack);
  if (!meta) return [];
  const out: string[] = [];
  for (let i = 1; i <= meta.count; i++) {
    out.push(fanPortraitId(pack, i));
  }
  return out;
}

export function isFanPortraitId(id: string | null | undefined): boolean {
  if (!id) return false;
  const m = /^(ntd|spy|op)_(\d{2})$/.exec(id);
  if (!m) return false;
  const pack = m[1] as FanPackId;
  const idx = parseInt(m[2], 10);
  const meta = FAN_PACKS.find((p) => p.id === pack);
  return !!meta && idx >= 1 && idx <= meta.count;
}

export function fanPackFromId(id: string): FanPackId | null {
  const m = /^(ntd|spy|op)_/.exec(id);
  return m ? (m[1] as FanPackId) : null;
}
