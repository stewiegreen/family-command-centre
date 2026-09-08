/** Curated cosmetics kids unlock via the ChoreQuest shop. */

export type FlairOption = {
  id: string;
  label: string;
  /** Short preview for pickers */
  preview: string;
};

/** Rings / frames around the avatar circle. */
export const AVATAR_FLAIR: FlairOption[] = [
  { id: 'none', label: 'None', preview: '○' },
  { id: 'gold', label: 'Gold ring', preview: '🟡' },
  { id: 'neon', label: 'Neon glow', preview: '💜' },
  { id: 'ice', label: 'Ice rim', preview: '💠' },
  { id: 'fire', label: 'Fire rim', preview: '🔥' },
  { id: 'pixel', label: 'Pixel border', preview: '🟩' },
  { id: 'star', label: 'Star burst', preview: '⭐' },
  { id: 'dragon', label: 'Dragon scale', preview: '🐉' },
];

/** Title under the real name — not a rename. */
export const NAME_FLAIR: FlairOption[] = [
  { id: 'none', label: 'None', preview: '' },
  { id: 'questing', label: 'Questing', preview: 'Questing' },
  { id: 'unstoppable', label: 'The Unstoppable', preview: 'The Unstoppable' },
  { id: 'sock-slayer', label: 'Sock Slayer', preview: 'Sock Slayer' },
  { id: 'dragon-tamer', label: 'Dragon Tamer', preview: 'Dragon Tamer' },
  { id: 'chore-knight', label: 'Chore Knight', preview: 'Chore Knight' },
  { id: 'night-owl', label: 'Night Owl', preview: 'Night Owl' },
  { id: 'speedrunner', label: 'Speedrunner', preview: 'Speedrunner' },
  { id: 'legend', label: 'Local Legend', preview: 'Local Legend' },
];

export function avatarFlairClass(id?: string): string {
  switch (id) {
    case 'gold':
      return 'ring-4 ring-amber-400 ring-offset-2 ring-offset-surface shadow-[0_0_12px_rgba(251,191,36,0.55)]';
    case 'neon':
      return 'ring-4 ring-fuchsia-400 ring-offset-2 ring-offset-surface shadow-[0_0_14px_rgba(232,121,249,0.6)]';
    case 'ice':
      return 'ring-4 ring-cyan-300 ring-offset-2 ring-offset-surface shadow-[0_0_12px_rgba(103,232,249,0.5)]';
    case 'fire':
      return 'ring-4 ring-orange-500 ring-offset-2 ring-offset-surface shadow-[0_0_14px_rgba(249,115,22,0.55)]';
    case 'pixel':
      return 'ring-4 ring-emerald-400 ring-offset-0 rounded-md';
    case 'star':
      return 'ring-4 ring-yellow-300 ring-offset-2 ring-offset-surface shadow-[0_0_16px_rgba(253,224,71,0.65)]';
    case 'dragon':
      return 'ring-4 ring-lime-500 ring-offset-2 ring-offset-surface shadow-[0_0_12px_rgba(132,204,22,0.5)]';
    default:
      return '';
  }
}

export function nameFlairLabel(id?: string): string | null {
  if (!id || id === 'none') return null;
  return NAME_FLAIR.find((f) => f.id === id)?.label || null;
}
