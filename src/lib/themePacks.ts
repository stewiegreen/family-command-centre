/** Curated Theme Studio add-ons (accent packs + wallpapers). */

export type AccentPack = {
  id: string;
  label: string;
  accent: string;
  secondary: string;
};

export type WallpaperPack = {
  id: string;
  label: string;
  /** CSS background-image value (no "background-image:" prefix) */
  image: string;
  /** Optional background-size */
  size?: string;
};

export const ACCENT_PACKS: AccentPack[] = [
  { id: 'spy-pink', label: 'Spy pink', accent: '#e85a7a', secondary: '#c9a227' },
  { id: 'neon-cyan', label: 'Neon cyan', accent: '#00c8ff', secondary: '#ff2db8' },
  { id: 'ember', label: 'Ember', accent: '#ea580c', secondary: '#d4a05a' },
  { id: 'forest', label: 'Forest', accent: '#5ba88f', secondary: '#d4b896' },
  { id: 'violet', label: 'Violet pulse', accent: '#8b5cf6', secondary: '#22d3ee' },
  { id: 'rose-gold', label: 'Rose gold', accent: '#e11d48', secondary: '#d4a574' },
];

export const WALLPAPERS: WallpaperPack[] = [
  {
    id: 'soft-grid',
    label: 'Soft grid',
    image:
      'linear-gradient(rgba(128,128,128,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(128,128,128,0.06) 1px, transparent 1px)',
    size: '28px 28px',
  },
  {
    id: 'dawn',
    label: 'Dawn wash',
    image:
      'radial-gradient(ellipse at 20% 0%, rgba(232,90,122,0.18), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(0,200,255,0.12), transparent 45%)',
  },
  {
    id: 'ember-glow',
    label: 'Ember glow',
    image:
      'radial-gradient(ellipse at 50% -20%, rgba(234,88,12,0.22), transparent 55%)',
  },
  {
    id: 'mist',
    label: 'Cool mist',
    image:
      'linear-gradient(165deg, rgba(255,255,255,0.04), transparent 40%), radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.12), transparent 50%)',
  },
  {
    id: 'diagonal',
    label: 'Diagonal hush',
    image:
      'repeating-linear-gradient(-12deg, transparent, transparent 48px, rgba(255,255,255,0.03) 48px, rgba(255,255,255,0.03) 50px)',
  },
];

export function wallpaperById(id: string | null | undefined): WallpaperPack | undefined {
  if (!id) return undefined;
  return WALLPAPERS.find((w) => w.id === id);
}
