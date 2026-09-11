/** Curated Theme Studio add-ons. */

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
  /** True for photo-based wallpapers (blurred in Layout) */
  photo?: boolean;
};

export type FontPack = {
  id: string;
  label: string;
  /** Google Fonts CSS2 URL fragment after css2? — null = app default */
  googleHref: string | null;
  /** CSS font-family for UI / body */
  ui: string;
  /** CSS font-family for headings */
  display: string;
};

export type CardStyleId = 'soft' | 'sharp' | 'glassy';

export type CardShadowId = 'none' | 'soft' | 'glow';

export const CARD_STYLES: {
  id: CardStyleId;
  label: string;
  hint: string;
}[] = [
  { id: 'soft', label: 'Soft', hint: 'Rounded, gentle' },
  { id: 'sharp', label: 'Sharp', hint: 'Tighter corners' },
  { id: 'glassy', label: 'Glassy', hint: 'More blur & float' },
];

export const CARD_SHADOWS: {
  id: CardShadowId;
  label: string;
  hint: string;
  /** CSS box-shadow value */
  shadow: string;
}[] = [
  {
    id: 'none',
    label: 'Flat',
    hint: 'No shadow',
    shadow: 'none',
  },
  {
    id: 'soft',
    label: 'Soft lift',
    hint: 'Gentle depth',
    shadow: '0 4px 18px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08)',
  },
  {
    id: 'glow',
    label: 'Accent glow',
    hint: 'Coloured edge light',
    shadow:
      '0 0 0 1px color-mix(in srgb, var(--app-accent) 35%, transparent), 0 0 22px color-mix(in srgb, var(--app-accent) 40%, transparent), 0 8px 24px rgba(0,0,0,0.18)',
  },
];

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

/** Special wallpaper ids for picture-frame photos (not in WALLPAPERS list). */
export const FRAME_WALLPAPER_1 = 'frame:1';
export const FRAME_WALLPAPER_2 = 'frame:2';

export function isFrameWallpaperId(id: string | null | undefined): id is typeof FRAME_WALLPAPER_1 | typeof FRAME_WALLPAPER_2 {
  return id === FRAME_WALLPAPER_1 || id === FRAME_WALLPAPER_2;
}

export const FONT_PACKS: FontPack[] = [
  {
    id: 'default',
    label: 'Default',
    googleHref: null,
    ui: '"Inter", system-ui, sans-serif',
    display: '"Fraunces", Georgia, serif',
  },
  {
    id: 'playful',
    label: 'Playful',
    googleHref:
      'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&family=Fredoka:wght@500;600&display=swap',
    ui: '"Nunito", system-ui, sans-serif',
    display: '"Fredoka", system-ui, sans-serif',
  },
  {
    id: 'tech',
    label: 'Tech',
    googleHref:
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap',
    ui: '"IBM Plex Sans", system-ui, sans-serif',
    display: '"Space Grotesk", system-ui, sans-serif',
  },
  {
    id: 'story',
    label: 'Storybook',
    googleHref:
      'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=Source+Sans+3:wght@400;600;700&display=swap',
    ui: '"Source Sans 3", system-ui, sans-serif',
    display: '"Literata", Georgia, serif',
  },
];

export function wallpaperById(id: string | null | undefined): WallpaperPack | undefined {
  if (!id || isFrameWallpaperId(id)) return undefined;
  return WALLPAPERS.find((w) => w.id === id);
}

export function fontPackById(id: string | null | undefined): FontPack {
  return FONT_PACKS.find((f) => f.id === id) || FONT_PACKS[0]!;
}
