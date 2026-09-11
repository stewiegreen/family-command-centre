import {
  wallpaperById,
  isFrameWallpaperId,
  fontPackById,
  CARD_SHADOWS,
  type CardStyleId,
  type CardShadowId,
} from './themePacks';
/** Color helpers for Theme Studio custom overrides. */

export type ThemeTokenSet = {
  page: string;
  elevated: string;
  accent: string;
  fg: string;
  secondary?: string;
  /** Left nav / mobile drawer */
  sidebar?: string;
  /** Sticky top bar */
  header?: string;
};

const CUSTOM_PROPS = [
  '--app-page',
  '--app-elevated',
  '--app-surface',
  '--app-surface-2',
  '--app-surface-3',
  '--app-inset',
  '--app-header',
  '--app-sidebar',
  '--app-nav-hover',
  '--app-input',
  '--app-border',
  '--app-border-strong',
  '--app-fg',
  '--app-fg-secondary',
  '--app-muted',
  '--app-faint',
  '--app-accent',
  '--app-accent-hover',
  '--app-accent-tint',
  '--app-accent-tint-strong',
  '--app-accent-ink',
  '--app-secondary',
  '--app-ring-offset',
] as const;

export function clearCustomThemeProperties(root: HTMLElement = document.documentElement): void {
  for (const p of CUSTOM_PROPS) root.style.removeProperty(p);
  // Belt-and-braces: drop other inline --app-* left on <html>,
  // but keep wallpaper vars (re-applied after this, and must survive mid-frame).
  const toRemove: string[] = [];
  for (let i = 0; i < root.style.length; i++) {
    const name = root.style.item(i);
    if (
      name &&
      name.startsWith('--app-') &&
      !name.startsWith('--app-wallpaper-')
    ) {
      toRemove.push(name);
    }
  }
  for (const name of toRemove) root.style.removeProperty(name);
  // Body may have been forced solid by a custom theme
  document.body.style.removeProperty('background-image');
  document.body.style.removeProperty('background-color');
}

/** Parse #rgb, #rrggbb, #rrggbbaa, rgb(), rgba() → [r,g,b,a] 0–255 / 0–1 */
export function parseColor(input: string): [number, number, number, number] | null {
  const s = input.trim();
  if (!s) return null;
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) {
      h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
    }
    if (h.length === 4) {
      h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! + h[3]! + h[3]!;
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return [r, g, b, a];
    }
  }
  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgb) {
    return [
      Number(rgb[1]),
      Number(rgb[2]),
      Number(rgb[3]),
      rgb[4] != null ? Number(rgb[4]) : 1,
    ];
  }
  return null;
}

function channelLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string): number | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const [r, g, b] = parsed;
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

/** WCAG contrast ratio between two colors (higher is better). */
export function contrastRatio(a: string, b: string): number | null {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  if (l1 == null || l2 == null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Advisory contrast notes only — never used to block save.
 * Theme Studio trusts the live preview; kids/parents decide readability.
 */
export function contrastIssues(tokens: ThemeTokenSet): string[] {
  const notes: string[] = [];
  const pageRatio = contrastRatio(tokens.fg, tokens.page);
  const cardRatio = contrastRatio(tokens.fg, tokens.elevated);

  if (pageRatio == null || cardRatio == null) {
    notes.push('Could not parse a colour — prefer #RRGGBB if something looks off.');
    return notes;
  }

  if (cardRatio < 3) {
    notes.push(
      `Heads-up: text vs card is ${cardRatio.toFixed(1)}:1 (preview is the source of truth).`,
    );
  }
  if (pageRatio < 3) {
    notes.push(
      `Heads-up: text vs page is ${pageRatio.toFixed(1)}:1 (often fine when text sits on cards).`,
    );
  }
  return notes;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) => clampByte(x).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Lighten/darken a hex/rgb colour by factor (positive = lighter). */
export function adjustLightness(color: string, factor: number): string {
  const p = parseColor(color);
  if (!p) return color;
  const [r, g, b] = p;
  if (factor >= 0) {
    return toHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  }
  const f = 1 + factor;
  return toHex(r * f, g * f, b * f);
}

export function accentInk(accent: string): string {
  const l = relativeLuminance(accent);
  if (l == null) return '#ffffff';
  return l > 0.45 ? '#1a1a1a' : '#ffffff';
}

function rgbaOf(color: string, alpha: number): string {
  const p = parseColor(color);
  if (!p) return color;
  return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})`;
}

/** Derive full chrome (sidebar/header/muted/borders) from the five Theme Studio tokens. */

/** Dark text on light secondary, light text on dark secondary. */
function secondaryInkFor(hexOrCss: string): string {
  const parsed = parseColor(hexOrCss);
  if (!parsed) return '#1a1a1a';
  const [r, g, b] = parsed;
  // relative luminance
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? '#1a1a1a' : '#fafafa';
}

export function applyTokenSetToElement(el: HTMLElement, tokens: ThemeTokenSet): void {
  el.style.setProperty('--app-page', tokens.page);
  el.style.setProperty('--app-elevated', tokens.elevated);
  // Surfaces track the card colour so lists/inputs match
  el.style.setProperty('--app-surface', tokens.elevated);
  el.style.setProperty('--app-surface-2', adjustLightness(tokens.elevated, 0.06));
  el.style.setProperty('--app-surface-3', adjustLightness(tokens.elevated, 0.12));
  el.style.setProperty('--app-inset', rgbaOf(tokens.page, 0.85));
  // Sidebar + top bar — explicit pickers, else fall back to page
  const sidebar = (tokens.sidebar || '').trim() || tokens.page;
  const header = (tokens.header || '').trim() || tokens.page;
  el.style.setProperty('--app-sidebar', sidebar);
  el.style.setProperty('--app-header', rgbaOf(header, 0.94));
  el.style.setProperty('--app-nav-hover', adjustLightness(tokens.elevated, 0.08));
  el.style.setProperty('--app-input', adjustLightness(tokens.elevated, -0.04));
  el.style.setProperty('--app-ring-offset', tokens.page);

  el.style.setProperty('--app-fg', tokens.fg);
  el.style.setProperty('--app-fg-secondary', rgbaOf(tokens.fg, 0.78));
  el.style.setProperty('--app-muted', rgbaOf(tokens.fg, 0.62));
  el.style.setProperty('--app-faint', rgbaOf(tokens.fg, 0.42));
  el.style.setProperty('--app-border', rgbaOf(tokens.fg, 0.18));
  el.style.setProperty('--app-border-strong', rgbaOf(tokens.fg, 0.32));

  el.style.setProperty('--app-accent', tokens.accent);
  el.style.setProperty('--app-accent-hover', adjustLightness(tokens.accent, 0.18));
  const a = parseColor(tokens.accent);
  if (a) {
    el.style.setProperty(
      '--app-accent-tint',
      `rgba(${a[0]}, ${a[1]}, ${a[2]}, 0.18)`,
    );
    el.style.setProperty(
      '--app-accent-tint-strong',
      `rgba(${a[0]}, ${a[1]}, ${a[2]}, 0.28)`,
    );
  }
  el.style.setProperty('--app-accent-ink', accentInk(tokens.accent));
  // Secondary accent — full colour + contrasting ink for solid buttons
  const sec = tokens.secondary?.trim() || tokens.accent;
  el.style.setProperty('--app-secondary', sec);
  el.style.setProperty('--app-secondary-ink', secondaryInkFor(sec));
}

export function applyCustomThemeToDocument(tokens: ThemeTokenSet): void {
  applyTokenSetToElement(document.documentElement, tokens);
  // Spy×Family (and similar) hard-code body background-image; force the page
  // colour so "Page background" in Theme Studio actually shows up.
  document.body.style.backgroundImage = 'none';
  document.body.style.backgroundColor = tokens.page;
}

/** Sensible starting tokens when “start from” a preset (approximate). */
export const PRESET_START_TOKENS: Record<string, ThemeTokenSet> = {
  dark: {
    page: '#1c1917',
    elevated: '#292524',
    accent: '#ea580c',
    fg: '#fafaf9',
    secondary: '#a8a29e',
    sidebar: '#181512',
    header: '#141210',
  },
  light: {
    page: '#f5f5f0',
    elevated: '#ffffff',
    accent: '#e8614a',
    fg: '#1c1c1e',
    secondary: '#8a8a8e',
    sidebar: '#fffcf8',
    header: '#fffcf8',
  },
  neon: {
    page: '#07070f',
    elevated: '#0e0e1c',
    accent: '#00c8ff',
    fg: '#e8f4ff',
    secondary: '#ff2db8',
    sidebar: '#080812',
    header: '#06060e',
  },
  spyfamily: {
    page: '#6b8f7a',
    elevated: '#fffcf7',
    accent: '#e85a7a',
    fg: '#1a1c1b',
    secondary: '#c9a227',
    sidebar: '#5a7d6a',
    header: '#6b8f7a',
  },
};

/**
 * Wallpaper is applied as CSS variables on <html>.
 * The app shell (Layout) reads them — painting on body is invisible because
 * Layout's full-viewport `bg-page` div sits on top of body.
 */
export function applyWallpaperToDocument(
  wallpaperId: string | null | undefined,
  frameUrl?: string | null,
): void {
  const root = document.documentElement;
  if (!wallpaperId) {
    root.style.removeProperty('--app-wallpaper-image');
    root.style.removeProperty('--app-wallpaper-size');
    root.style.removeProperty('--app-wallpaper-repeat');
    root.style.removeProperty('--app-wallpaper-attachment');
    root.dataset.wallpaperPhoto = '0';
    return;
  }

  if (isFrameWallpaperId(wallpaperId)) {
    if (!frameUrl) {
      root.style.removeProperty('--app-wallpaper-image');
      root.dataset.wallpaperPhoto = '0';
      root.style.setProperty('--app-wallpaper-photo-layer', 'none');
      return;
    }
    // Photo for blur layer; shell stays solid page colour
    const safe = frameUrl.replace(/"/g, '%22');
    root.style.setProperty('--app-wallpaper-image', `url("${safe}")`);
    root.style.setProperty('--app-wallpaper-size', 'cover');
    root.style.setProperty('--app-wallpaper-repeat', 'no-repeat');
    root.style.setProperty('--app-wallpaper-attachment', 'fixed');
    root.style.setProperty('--app-wallpaper-photo-layer', 'block');
    root.dataset.wallpaperPhoto = '1';
    return;
  }

  const pack = wallpaperById(wallpaperId);
  if (!pack) {
    root.style.removeProperty('--app-wallpaper-image');
    root.dataset.wallpaperPhoto = '0';
    return;
  }
  root.style.setProperty('--app-wallpaper-image', pack.image);
  root.style.setProperty('--app-wallpaper-size', pack.size || 'cover');
  root.style.setProperty(
    '--app-wallpaper-repeat',
    pack.size ? 'repeat' : 'no-repeat',
  );
  root.style.setProperty('--app-wallpaper-attachment', 'fixed');
  root.dataset.wallpaperPhoto = pack.photo ? '1' : '0';
  root.style.setProperty('--app-wallpaper-photo-layer', pack.photo ? 'block' : 'none');
}

/** Card corner / glass style for Theme Studio — also drives global radius scale. */
export function applyCardStyleToDocument(style: CardStyleId | null | undefined): void {
  const root = document.documentElement;
  const id = style || 'soft';
  root.dataset.cardStyle = id;
  if (id === 'sharp') {
    root.style.setProperty('--app-card-radius', '0.4rem');
    root.style.setProperty('--app-card-blur', '0px');
    root.style.setProperty('--app-radius-sm', '0.2rem');
    root.style.setProperty('--app-radius-md', '0.3rem');
    root.style.setProperty('--app-radius-lg', '0.4rem');
    root.style.setProperty('--app-radius-xl', '0.45rem');
    root.style.setProperty('--app-radius-2xl', '0.5rem');
    root.style.setProperty('--app-radius-3xl', '0.55rem');
  } else if (id === 'glassy') {
    root.style.setProperty('--app-card-radius', '1.25rem');
    root.style.setProperty('--app-card-blur', '14px');
    root.style.setProperty('--app-radius-sm', '0.5rem');
    root.style.setProperty('--app-radius-md', '0.75rem');
    root.style.setProperty('--app-radius-lg', '1rem');
    root.style.setProperty('--app-radius-xl', '1.15rem');
    root.style.setProperty('--app-radius-2xl', '1.35rem');
    root.style.setProperty('--app-radius-3xl', '1.5rem');
  } else {
    root.style.setProperty('--app-card-radius', '1rem');
    root.style.setProperty('--app-card-blur', '6px');
    root.style.setProperty('--app-radius-sm', '0.375rem');
    root.style.setProperty('--app-radius-md', '0.5rem');
    root.style.setProperty('--app-radius-lg', '0.75rem');
    root.style.setProperty('--app-radius-xl', '0.75rem');
    root.style.setProperty('--app-radius-2xl', '1rem');
    root.style.setProperty('--app-radius-3xl', '1.25rem');
  }
}

/** Card shadow / glow preset (independent of corner style). */
export function applyCardShadowToDocument(shadow: CardShadowId | null | undefined): void {
  const root = document.documentElement;
  const id = (shadow || 'soft') as CardShadowId;
  const pack = CARD_SHADOWS.find((s) => s.id === id) || CARD_SHADOWS[1]!;
  root.dataset.cardShadow = pack.id;
  root.style.setProperty('--app-shadow-card', pack.shadow);
}

/** Soft glow on accent buttons / chips. */
export function applyAccentGlowToDocument(on: boolean | undefined): void {
  document.documentElement.dataset.accentGlow = on ? '1' : '0';
}

/** Card fill opacity 0.5–1 (does not fade text — only surface colour). */
export function applyCardOpacityToDocument(opacity: number | null | undefined): void {
  const root = document.documentElement;
  const o =
    typeof opacity === 'number' && Number.isFinite(opacity)
      ? Math.min(1, Math.max(0.5, opacity))
      : 1;
  root.style.setProperty('--app-card-opacity', String(o));
  // Percentage for color-mix
  root.style.setProperty('--app-card-opacity-pct', `${Math.round(o * 100)}%`);
}

/** Background / wallpaper photo blur in px (0–40). */
export function applyWallpaperBlurToDocument(px: number | null | undefined): void {
  const root = document.documentElement;
  const v =
    typeof px === 'number' && Number.isFinite(px)
      ? Math.min(40, Math.max(0, Math.round(px)))
      : 28;
  root.style.setProperty('--app-wallpaper-blur', `${v}px`);
}

const FONT_LINK_ID = 'hq-font-pack';

/** Load a font pack (Google Fonts) and set CSS variables. */
export function applyFontPackToDocument(packId: string | null | undefined): void {
  const pack = fontPackById(packId || 'default');
  const root = document.documentElement;
  root.style.setProperty('--font-ui', pack.ui);
  root.style.setProperty('--font-display', pack.display);

  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!pack.googleHref) {
    if (link) link.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== pack.googleHref) {
    link.href = pack.googleHref;
  }
}
