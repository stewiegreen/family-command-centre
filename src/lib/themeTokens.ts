/** Color helpers for Theme Studio custom overrides. */

export type ThemeTokenSet = {
  page: string;
  elevated: string;
  accent: string;
  fg: string;
  secondary?: string;
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
  // Belt-and-braces: drop any other inline --app-* left on <html>
  const toRemove: string[] = [];
  for (let i = 0; i < root.style.length; i++) {
    const name = root.style.item(i);
    if (name && name.startsWith('--app-')) toRemove.push(name);
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

export function contrastIssues(tokens: ThemeTokenSet): string[] {
  const issues: string[] = [];
  const pageRatio = contrastRatio(tokens.fg, tokens.page);
  if (pageRatio != null && pageRatio < 4.5) {
    issues.push(
      `Text vs background contrast is too low (${pageRatio.toFixed(1)}:1 — need at least 4.5:1).`,
    );
  }
  const cardRatio = contrastRatio(tokens.fg, tokens.elevated);
  if (cardRatio != null && cardRatio < 4.5) {
    issues.push(
      `Text vs card contrast is too low (${cardRatio.toFixed(1)}:1 — need at least 4.5:1).`,
    );
  }
  if (pageRatio == null || cardRatio == null) {
    issues.push('Could not read one of the colours — use #RRGGBB or rgb().');
  }
  return issues;
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
export function applyTokenSetToElement(el: HTMLElement, tokens: ThemeTokenSet): void {
  el.style.setProperty('--app-page', tokens.page);
  el.style.setProperty('--app-elevated', tokens.elevated);
  // Surfaces track the card colour so lists/inputs match
  el.style.setProperty('--app-surface', tokens.elevated);
  el.style.setProperty('--app-surface-2', adjustLightness(tokens.elevated, 0.06));
  el.style.setProperty('--app-surface-3', adjustLightness(tokens.elevated, 0.12));
  el.style.setProperty('--app-inset', rgbaOf(tokens.page, 0.85));
  // Sidebar + top bar — these were stuck on the preset before
  el.style.setProperty('--app-sidebar', tokens.page);
  el.style.setProperty('--app-header', rgbaOf(tokens.page, 0.94));
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
  if (tokens.secondary) {
    el.style.setProperty('--app-secondary', tokens.secondary);
  } else {
    el.style.removeProperty('--app-secondary');
  }
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
  },
  light: {
    page: '#f5f5f0',
    elevated: '#ffffff',
    accent: '#e8614a',
    fg: '#1c1c1e',
    secondary: '#8a8a8e',
  },
  neon: {
    page: '#07070f',
    elevated: '#0e0e1c',
    accent: '#00c8ff',
    fg: '#e8f4ff',
    secondary: '#ff2db8',
  },
  spyfamily: {
    page: '#6b8f7a',
    elevated: '#fffcf7',
    accent: '#e85a7a',
    fg: '#1a1c1b',
    secondary: '#c9a227',
  },
};
