import { useMemo, useState } from 'react';
import { Palette, Lock, Check, Plus, Trash2, Pencil, Copy, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { uid } from '../lib/uid';
import type { ThemeId } from '../types';
import {
  PRESET_START_TOKENS,
  contrastIssues,
  type ThemeTokenSet,
} from '../lib/themeTokens';
import {
  ACCENT_PACKS,
  WALLPAPERS,
  FONT_PACKS,
  CARD_STYLES,
  CARD_SHADOWS,
  FRAME_WALLPAPER_1,
  FRAME_WALLPAPER_2,
} from '../lib/themePacks';
import { cn } from '../lib/cn';

/** Slots included with Theme Studio unlock. */
export const THEME_SLOTS_BASE = 3;
/** Hard cap including purchased extras. */
export const THEME_SLOTS_MAX = 8;

export function themeSlotLimit(extra?: number): number {
  return Math.min(THEME_SLOTS_MAX, THEME_SLOTS_BASE + Math.max(0, extra || 0));
}

const PRESETS: { id: ThemeId; label: string }[] = [
  { id: 'dark', label: 'Warm dark' },
  { id: 'light', label: 'Warm light' },
  { id: 'neon', label: 'Neon' },
  { id: 'spyfamily', label: 'Spy×Family' },
];

type SavedTheme = {
  id: string;
  name: string;
  basedOn: ThemeId;
  tokens: ThemeTokenSet;
  createdAt: string;
  updatedAt: string;
};

function ColorField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const hexForPicker = (() => {
    const m = value.trim().match(/^#([0-9a-f]{6})/i);
    if (m) return `#${m[1]}`;
    return '#888888';
  })();

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted block">
        {label}
        {optional ? ' (optional)' : ''}
      </label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={hexForPicker}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border border-border bg-inset cursor-pointer"
          title={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={optional ? 'Leave blank to skip' : '#RRGGBB'}
          className="flex-1 rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent font-mono"
        />
      </div>
    </div>
  );
}

function SwatchRow({ tokens }: { tokens: ThemeTokenSet }) {
  const colours = [
    tokens.page,
    tokens.sidebar || tokens.page,
    tokens.header || tokens.page,
    tokens.elevated,
    tokens.accent,
    tokens.fg,
  ];
  return (
    <div className="flex gap-1">
      {colours.map((c, i) => (
        <div
          key={i}
          className="w-5 h-5 rounded-md border border-border"
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function emptyDraft(preset: ThemeId): ThemeTokenSet {
  return { ...PRESET_START_TOKENS[preset] };
}

export function ThemeStudioPage() {
  const { data, update, currentUser, setView } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const appearance = data.appearance?.[myId] || {};
  const unlocked = !!appearance.unlockThemeStudio;

  const saved = (appearance.customThemes || []) as SavedTheme[];
  const activeId = appearance.activeCustomThemeId || null;
  const slotLimit = themeSlotLimit(appearance.extraThemeSlots);
  const slotsUsed = saved.length;
  const slotsFree = Math.max(0, slotLimit - slotsUsed);

  const currentPreset: ThemeId =
    appearance.theme || data.settings.theme || 'dark';

  /** null = browsing library only; 'new' = creating; id = editing that theme */
  const [editorMode, setEditorMode] = useState<'new' | string | null>(
    saved.length === 0 ? 'new' : null,
  );
  const [name, setName] = useState('My theme');
  const [basedOn, setBasedOn] = useState<ThemeId>(currentPreset);
  const [tokens, setTokens] = useState<ThemeTokenSet>(() => emptyDraft(currentPreset));
  const [msg, setMsg] = useState('');

  const issues = useMemo(() => contrastIssues(tokens), [tokens]);

  const setToken = (key: keyof ThemeTokenSet, value: string) => {
    setTokens((t) => ({ ...t, [key]: value }));
    setMsg('');
  };

  const applyStartFrom = (preset: ThemeId) => {
    setBasedOn(preset);
    setTokens(emptyDraft(preset));
    setMsg('');
  };

  const openNew = () => {
    if (slotsFree <= 0) {
      setMsg(
        `No free slots (${slotsUsed}/${slotLimit}). Buy “Theme slot +1” in the shop or delete a theme.`,
      );
      return;
    }
    setEditorMode('new');
    setName('My theme');
    setBasedOn(currentPreset);
    setTokens(emptyDraft(currentPreset));
    setMsg('');
  };

  const openEdit = (theme: SavedTheme) => {
    setEditorMode(theme.id);
    setName(theme.name);
    setBasedOn(theme.basedOn || currentPreset);
    setTokens({ ...emptyDraft(theme.basedOn || currentPreset), ...theme.tokens });
    setMsg('');
  };

  const cancelEditor = () => {
    setEditorMode(null);
    setMsg('');
  };

  const buildEntry = (id: string, createdAt: string): SavedTheme => {
    const now = new Date().toISOString();
    return {
      id,
      name: name.trim() || 'My theme',
      basedOn,
      tokens: {
        page: tokens.page.trim(),
        elevated: tokens.elevated.trim(),
        accent: tokens.accent.trim(),
        fg: tokens.fg.trim(),
        ...(tokens.secondary?.trim()
          ? { secondary: tokens.secondary.trim() }
          : {}),
        ...(tokens.sidebar?.trim() ? { sidebar: tokens.sidebar.trim() } : {}),
        ...(tokens.header?.trim() ? { header: tokens.header.trim() } : {}),
      },
      createdAt,
      updatedAt: now,
    };
  };

  const saveTheme = (andApply: boolean) => {
    if (!unlocked || !myId) return;

    if (editorMode === 'new' && slotsFree <= 0) {
      setMsg(`No free slots (${slotsUsed}/${slotLimit}).`);
      return;
    }

    const now = new Date().toISOString();
    const existing =
      editorMode && editorMode !== 'new'
        ? saved.find((t) => t.id === editorMode)
        : undefined;
    const id = existing?.id || uid();
    const entry = buildEntry(id, existing?.createdAt || now);

    update((d) => {
      const prev = d.appearance?.[myId] || {};
      const list = [...((prev.customThemes || []) as SavedTheme[])];
      const idx = list.findIndex((t) => t.id === id);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);

      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [myId]: {
            ...prev,
            customThemes: list,
            theme: basedOn,
            ...(andApply ? { activeCustomThemeId: id } : {}),
          },
        },
      };
    });

    setEditorMode(null);
    setMsg(andApply ? 'Saved and applied!' : 'Saved to library.');
  };

  const applySaved = (theme: SavedTheme) => {
    if (!myId) return;
    update((d) => {
      const prev = d.appearance?.[myId] || {};
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [myId]: {
            ...prev,
            theme: theme.basedOn,
            activeCustomThemeId: theme.id,
          },
        },
      };
    });
    setMsg(`Applied “${theme.name}”.`);
  };

  const deleteSaved = (theme: SavedTheme) => {
    if (!myId) return;
    if (!confirm(`Delete “${theme.name}”?`)) return;
    update((d) => {
      const prev = d.appearance?.[myId] || {};
      const list = ((prev.customThemes || []) as SavedTheme[]).filter(
        (t) => t.id !== theme.id,
      );
      const clearingActive = prev.activeCustomThemeId === theme.id;
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [myId]: {
            ...prev,
            customThemes: list,
            ...(clearingActive ? { activeCustomThemeId: null } : {}),
          },
        },
      };
    });
    if (editorMode === theme.id) setEditorMode(null);
    setMsg(`Deleted “${theme.name}”.`);
  };

  /** Clone a theme into this member's library (new id). Returns false if no slot. */
  const cloneIntoMyLibrary = (
    source: SavedTheme,
    nameOverride?: string,
  ): boolean => {
    if (!myId) return false;
    if (slotsFree <= 0) {
      setMsg(
        `No free slots (${slotsUsed}/${slotLimit}). Buy “Theme slot +1” or delete a theme.`,
      );
      return false;
    }
    const now = new Date().toISOString();
    const entry: SavedTheme = {
      id: uid(),
      name: nameOverride || source.name,
      basedOn: source.basedOn,
      tokens: { ...source.tokens },
      createdAt: now,
      updatedAt: now,
    };
    update((d) => {
      const prev = d.appearance?.[myId] || {};
      const list = [...((prev.customThemes || []) as SavedTheme[]), entry];
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [myId]: { ...prev, customThemes: list },
        },
      };
    });
    setMsg(`Copied “${entry.name}” into your library.`);
    return true;
  };

  const duplicateSaved = (theme: SavedTheme) => {
    const base = theme.name.replace(/\s*\(copy\)$/i, '').trim() || theme.name;
    cloneIntoMyLibrary(theme, `${base} (copy)`);
  };

  /** Push one of my themes into another member's library (they need Studio + a free slot). */
  const shareToMember = (theme: SavedTheme, memberId: string, memberName: string) => {
    if (!myId) return;
    const theirApp = data.appearance?.[memberId] || {};
    if (!theirApp.unlockThemeStudio) {
      setMsg(`${memberName} hasn't unlocked Theme Studio yet.`);
      return;
    }
    const theirSaved = (theirApp.customThemes || []) as SavedTheme[];
    const theirLimit = themeSlotLimit(theirApp.extraThemeSlots);
    if (theirSaved.length >= theirLimit) {
      setMsg(`${memberName}'s theme library is full (${theirSaved.length}/${theirLimit}).`);
      return;
    }
    const now = new Date().toISOString();
    const entry: SavedTheme = {
      id: uid(),
      name: theme.name,
      basedOn: theme.basedOn,
      tokens: { ...theme.tokens },
      createdAt: now,
      updatedAt: now,
    };
    update((d) => {
      const prev = d.appearance?.[memberId] || {};
      const list = [...((prev.customThemes || []) as SavedTheme[]), entry];
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [memberId]: { ...prev, customThemes: list },
        },
      };
    });
    setMsg(`Shared “${theme.name}” with ${memberName}.`);
  };

  const familySources = (data.members || [])
    .filter((m) => m.id !== myId && m.role !== 'media')
    .flatMap((m) => {
      const themes = (data.appearance?.[m.id]?.customThemes || []) as SavedTheme[];
      return themes.map((theme) => ({
        memberId: m.id,
        memberName: m.name,
        theme,
      }));
    });

  const shareTargets = (data.members || []).filter(
    (m) =>
      m.id !== myId &&
      m.role !== 'media' &&
      !!data.appearance?.[m.id]?.unlockThemeStudio,
  );

  const usePresetInstead = () => {
    if (!myId) return;
    update((d) => {
      const prev = d.appearance?.[myId] || {};
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [myId]: {
            ...prev,
            activeCustomThemeId: null,
          },
        },
      };
    });
    setMsg('Using plain preset — custom colours cleared.');
  };

  if (!unlocked) {
    return (
      <div className="p-4 lg:p-8 max-w-lg mx-auto py-12 text-center space-y-4">
        <div className="inline-flex p-4 rounded-2xl bg-inset border border-border">
          <Lock className="w-8 h-8 text-muted" />
        </div>
        <h1 className="text-xl font-semibold text-fg">Theme Studio locked</h1>
        <p className="text-sm text-muted">
          Unlock Theme Studio in the ChoreQuest shop to design your own colours.
        </p>
        <Button onClick={() => setView('chores')}>Go to Shop</Button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-fg">
            <Palette className="w-6 h-6 text-accent" />
            Theme Studio
          </h1>
          <p className="text-sm text-muted mt-1">
            Library {slotsUsed}/{slotLimit} slots
            {appearance.extraThemeSlots
              ? ` · +${appearance.extraThemeSlots} bought`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={usePresetInstead}>
            Use a preset instead
          </Button>
          <Button type="button" onClick={openNew} disabled={slotsFree <= 0}>
            <Plus className="w-4 h-4" />
            New theme
          </Button>
        </div>
      </div>

      {msg && (
        <p className="text-sm text-accent flex items-center gap-1">
          {msg.startsWith('Saved') || msg.startsWith('Applied') ? (
            <Check className="w-4 h-4" />
          ) : null}
          {msg}
        </p>
      )}

      {/* Library */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
          Your themes
        </h2>
        {saved.length === 0 ? (
          <p className="text-sm text-muted">
            No saved themes yet — create one below.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {saved.map((theme) => {
              const isActive = activeId === theme.id;
              return (
                <div
                  key={theme.id}
                  className={cn(
                    'border bg-elevated p-4 space-y-3 studio-surface',
                    isActive ? 'border-accent ring-1 ring-accent/40' : 'border-border',
                  )}
                  style={{
                    borderRadius: 'var(--app-card-radius, 1rem)',
                    backdropFilter: 'blur(var(--app-card-blur, 6px))',
                    boxShadow: 'var(--app-shadow-card, none)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-fg">{theme.name}</p>
                      <p className="text-[11px] text-muted capitalize">
                        from {theme.basedOn}
                        {isActive ? ' · applied' : ''}
                      </p>
                    </div>
                    <SwatchRow tokens={theme.tokens} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => applySaved(theme)}
                      disabled={isActive}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(theme)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => duplicateSaved(theme)}
                      disabled={slotsFree <= 0}
                      title={slotsFree <= 0 ? 'No free slots' : 'Duplicate into a new slot'}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteSaved(theme)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {shareTargets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
                      <span className="text-[11px] text-muted">Share with</span>
                      {shareTargets.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted hover:text-fg hover:bg-nav-hover"
                          onClick={() => shareToMember(theme, m.id, m.name)}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {slotsFree <= 0 && (
          <p className="text-xs text-muted">
            Slot limit reached. Delete a theme or buy{' '}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => setView('chores')}
            >
              Theme slot +1
            </button>{' '}
            in the shop (max {THEME_SLOTS_MAX}).
          </p>
        )}
      </section>





      {/* ——— Look & feel (live on this page) ——— */}
      <section className="space-y-5 rounded-2xl border border-border bg-inset/40 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-fg">Look &amp; feel</h2>
          <p className="text-xs text-muted mt-0.5">
            Changes apply instantly — your theme cards above update so you can see the difference here.
          </p>
        </div>

        {/* Card style: three live sample cards */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
            Card corners
          </h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {CARD_STYLES.map((s) => {
              const active = (appearance.cardStyle || 'soft') === s.id;
              const sampleStyle =
                s.id === 'sharp'
                  ? {
                      borderRadius: '0.4rem',
                      backdropFilter: 'blur(0px)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }
                  : s.id === 'glassy'
                    ? {
                        borderRadius: '1.25rem',
                        backdropFilter: 'blur(14px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                      }
                    : {
                        borderRadius: '1rem',
                        backdropFilter: 'blur(6px)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      };
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (!myId) return;
                    update((d) => {
                      const prev = d.appearance?.[myId] || {};
                      return {
                        ...d,
                        appearance: {
                          ...(d.appearance || {}),
                          [myId]: { ...prev, cardStyle: s.id },
                        },
                      };
                    });
                    setMsg(`Card style: ${s.label}`);
                  }}
                  className={cn(
                    'text-left border bg-elevated p-3 transition-all',
                    active
                      ? 'border-accent ring-2 ring-accent/40'
                      : 'border-border hover:border-accent/40',
                  )}
                  style={sampleStyle}
                >
                  <p className="text-sm font-semibold text-fg">{s.label}</p>
                  <p className="text-[11px] text-muted mt-0.5">{s.hint}</p>
                  <div
                    className="mt-3 h-8 border border-border bg-page/50"
                    style={{ borderRadius: sampleStyle.borderRadius }}
                  />
                </button>
              );
            })}
          </div>
        </div>


        {/* Card shadow / glow */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
            Card shadow
          </h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {CARD_SHADOWS.map((s) => {
              const active = (appearance.cardShadow || 'soft') === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (!myId) return;
                    update((d) => {
                      const prev = d.appearance?.[myId] || {};
                      return {
                        ...d,
                        appearance: {
                          ...(d.appearance || {}),
                          [myId]: { ...prev, cardShadow: s.id },
                        },
                      };
                    });
                    setMsg(`Card shadow: ${s.label}`);
                  }}
                  className={cn(
                    'text-left border bg-elevated p-3 transition-all',
                    active
                      ? 'border-accent ring-2 ring-accent/40'
                      : 'border-border hover:border-accent/40',
                  )}
                  style={{
                    borderRadius: 'var(--app-card-radius, 1rem)',
                    boxShadow: s.shadow,
                  }}
                >
                  <p className="text-sm font-semibold text-fg">{s.label}</p>
                  <p className="text-[11px] text-muted mt-0.5">{s.hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent glow with live sample button */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
            Accent glow
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-fg cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={!!appearance.accentGlow}
                onChange={(e) => {
                  if (!myId) return;
                  const on = e.target.checked;
                  update((d) => {
                    const prev = d.appearance?.[myId] || {};
                    return {
                      ...d,
                      appearance: {
                        ...(d.appearance || {}),
                        [myId]: { ...prev, accentGlow: on },
                      },
                    };
                  });
                  setMsg(on ? 'Accent glow on' : 'Accent glow off');
                }}
              />
              Glow on buttons
            </label>
            <span
              className="inline-flex px-3 py-1.5 rounded-xl text-sm font-medium bg-accent text-accent-ink"
            >
              Sample button
            </span>
            <span className="text-xs text-muted">← toggles with the checkbox</span>
          </div>
        </div>

        {/* Card opacity + background blur */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
                Card opacity
              </h3>
              <span className="text-xs text-muted tabular-nums">
                {Math.round((appearance.cardOpacity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={Math.round((appearance.cardOpacity ?? 1) * 100)}
              className="w-full accent-[var(--app-accent)]"
              onChange={(e) => {
                if (!myId) return;
                const o = Number(e.target.value) / 100;
                update((d) => {
                  const prev = d.appearance?.[myId] || {};
                  return {
                    ...d,
                    appearance: {
                      ...(d.appearance || {}),
                      [myId]: { ...prev, cardOpacity: o },
                    },
                  };
                });
              }}
            />
            <p className="text-[11px] text-muted">
              Lower = more see-through cards (wallpaper shows through).
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
                Background blur
              </h3>
              <span className="text-xs text-muted tabular-nums">
                {appearance.wallpaperBlur ?? 28}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={appearance.wallpaperBlur ?? 28}
              className="w-full accent-[var(--app-accent)]"
              onChange={(e) => {
                if (!myId) return;
                const v = Number(e.target.value);
                update((d) => {
                  const prev = d.appearance?.[myId] || {};
                  return {
                    ...d,
                    appearance: {
                      ...(d.appearance || {}),
                      [myId]: { ...prev, wallpaperBlur: v },
                    },
                  };
                });
              }}
            />
            <p className="text-[11px] text-muted">
              Softens photo wallpapers (0 = sharp, 40 = very soft).
            </p>
          </div>
        </div>

        {/* Fonts with live type samples */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
            Fonts
          </h3>
          {!appearance.unlockFontPacks ? (
            <p className="text-sm text-muted">
              Unlock{' '}
              <button
                type="button"
                className="text-accent underline"
                onClick={() => setView('chores')}
              >
                Font vibe packs
              </button>{' '}
              in the shop to change typefaces.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {FONT_PACKS.map((f) => {
                const active =
                  (appearance.activeFontPackId || 'default') === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={cn(
                      'text-left px-3 py-2.5 rounded-xl border transition-colors',
                      active
                        ? 'border-accent bg-accent/15'
                        : 'border-border hover:bg-nav-hover',
                    )}
                    onClick={() => {
                      if (!myId) return;
                      update((d) => {
                        const prev = d.appearance?.[myId] || {};
                        return {
                          ...d,
                          appearance: {
                            ...(d.appearance || {}),
                            [myId]: {
                              ...prev,
                              activeFontPackId:
                                f.id === 'default' ? null : f.id,
                            },
                          },
                        };
                      });
                      setMsg(`Font: ${f.label}`);
                    }}
                  >
                    <span
                      className="text-sm font-semibold text-fg block"
                      style={{ fontFamily: f.display }}
                    >
                      {f.label}
                    </span>
                    <span
                      className="text-xs text-muted"
                      style={{ fontFamily: f.ui }}
                    >
                      The quick brown fox jumps — body text
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ——— Colours (packs) ——— */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-fg">Quick accent packs</h2>
          <p className="text-xs text-muted mt-0.5">
            One tap loads accent colours into the editor (save a theme to keep them).
          </p>
        </div>
        {!appearance.unlockAccentPacks ? (
          <p className="text-sm text-muted">
            Unlock{' '}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => setView('chores')}
            >
              Accent packs
            </button>{' '}
            in the shop.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ACCENT_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-elevated hover:border-accent/50 text-sm text-fg"
                title={`${pack.accent} / ${pack.secondary}`}
                onClick={() => {
                  setToken('accent', pack.accent);
                  setToken('secondary', pack.secondary);
                  if (editorMode == null) openNew();
                  setMsg(
                    `Accent pack “${pack.label}” loaded into the editor — save when ready.`,
                  );
                }}
              >
                <span
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ background: pack.accent }}
                />
                <span
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ background: pack.secondary }}
                />
                {pack.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ——— Backgrounds ——— */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-fg">Background</h2>
          <p className="text-xs text-muted mt-0.5">
            Pattern wallpapers or a photo from your picture frame.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              'px-3 py-2 rounded-xl border text-sm',
              !appearance.activeWallpaperId
                ? 'border-accent bg-accent/15 text-fg'
                : 'border-border text-muted hover:bg-nav-hover',
            )}
            onClick={() => {
              if (!myId) return;
              update((d) => {
                const prev = d.appearance?.[myId] || {};
                return {
                  ...d,
                  appearance: {
                    ...(d.appearance || {}),
                    [myId]: { ...prev, activeWallpaperId: null },
                  },
                };
              });
              setMsg('Wallpaper cleared.');
            }}
          >
            None
          </button>
          {appearance.unlockWallpapers &&
            WALLPAPERS.map((w) => {
              const active = appearance.activeWallpaperId === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  className={cn(
                    'px-3 py-2 rounded-xl border text-sm',
                    active
                      ? 'border-accent bg-accent/15 text-fg'
                      : 'border-border text-muted hover:bg-nav-hover',
                  )}
                  onClick={() => {
                    if (!myId) return;
                    update((d) => {
                      const prev = d.appearance?.[myId] || {};
                      return {
                        ...d,
                        appearance: {
                          ...(d.appearance || {}),
                          [myId]: { ...prev, activeWallpaperId: w.id },
                        },
                      };
                    });
                    setMsg(`Wallpaper “${w.label}” applied.`);
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          {!appearance.unlockWallpapers && (
            <p className="text-sm text-muted w-full">
              Pattern packs:{' '}
              <button
                type="button"
                className="text-accent underline"
                onClick={() => setView('chores')}
              >
                unlock Wallpaper packs
              </button>
            </p>
          )}
          {appearance.pictureFrameUrl && (
            <button
              type="button"
              className={cn(
                'px-3 py-2 rounded-xl border text-sm',
                appearance.activeWallpaperId === FRAME_WALLPAPER_1
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-border text-muted hover:bg-nav-hover',
              )}
              onClick={() => {
                if (!myId) return;
                update((d) => {
                  const prev = d.appearance?.[myId] || {};
                  return {
                    ...d,
                    appearance: {
                      ...(d.appearance || {}),
                      [myId]: {
                        ...prev,
                        activeWallpaperId: FRAME_WALLPAPER_1,
                      },
                    },
                  };
                });
                setMsg('Using picture frame 1 as wallpaper.');
              }}
            >
              Frame 1 photo
            </button>
          )}
          {appearance.pictureFrameUrl2 && (
            <button
              type="button"
              className={cn(
                'px-3 py-2 rounded-xl border text-sm',
                appearance.activeWallpaperId === FRAME_WALLPAPER_2
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-border text-muted hover:bg-nav-hover',
              )}
              onClick={() => {
                if (!myId) return;
                update((d) => {
                  const prev = d.appearance?.[myId] || {};
                  return {
                    ...d,
                    appearance: {
                      ...(d.appearance || {}),
                      [myId]: {
                        ...prev,
                        activeWallpaperId: FRAME_WALLPAPER_2,
                      },
                    },
                  };
                });
                setMsg('Using picture frame 2 as wallpaper.');
              }}
            >
              Frame 2 photo
            </button>
          )}
        </div>
      </section>

      {/* Copy from family */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide flex items-center gap-2">
          <Users className="w-4 h-4" />
          From family
        </h2>
        {familySources.length === 0 ? (
          <p className="text-sm text-muted">
            When someone else saves a custom theme, you can copy it here.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {familySources.map(({ memberId, memberName, theme }) => (
              <div
                key={`${memberId}-${theme.id}`}
                className="rounded-2xl border border-border bg-elevated p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-fg">{theme.name}</p>
                    <p className="text-[11px] text-muted">
                      {memberName}
                      <span className="capitalize"> · from {theme.basedOn}</span>
                    </p>
                  </div>
                  <SwatchRow tokens={theme.tokens} />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={slotsFree <= 0}
                  onClick={() =>
                    cloneIntoMyLibrary(theme, `${theme.name} (${memberName})`)
                  }
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy to my library
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Editor */}
      {editorMode != null && (
        <section className="space-y-4 rounded-2xl border border-border bg-elevated p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">
              {editorMode === 'new' ? 'New theme' : 'Edit theme'}
            </h2>
            <Button type="button" size="sm" variant="ghost" onClick={cancelEditor}>
              Cancel
            </Button>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Preview */}
            <div>
              <h3 className="text-xs text-muted uppercase tracking-wide mb-2">
                Preview
              </h3>
              <div
                className="rounded-2xl border border-border overflow-hidden"
                style={{ background: tokens.page, color: tokens.fg }}
              >
                <div className="flex min-h-[180px]">
                  <div
                    className="w-10 shrink-0 flex flex-col items-center gap-2 py-3 border-r border-black/10"
                    style={{ background: tokens.sidebar || tokens.page }}
                  >
                    <div
                      className="w-5 h-5 rounded-md"
                      style={{ background: tokens.accent }}
                    />
                    <div
                      className="w-5 h-5 rounded-md opacity-40"
                      style={{ background: tokens.fg }}
                    />
                  </div>
                  <div className="flex-1 flex flex-col min-w-0">
                    <div
                      className="h-9 shrink-0 flex items-center px-3 text-xs font-medium border-b border-black/10"
                      style={{
                        background: tokens.header || tokens.page,
                        color: tokens.fg,
                      }}
                    >
                      Hey, you
                    </div>
                    <div className="p-3 space-y-3">
                      <div
                        className="rounded-2xl border p-3"
                        style={{
                          background: tokens.elevated,
                          color: tokens.fg,
                          borderColor: 'rgba(128,128,128,0.35)',
                        }}
                      >
                        <p className="text-sm font-semibold mb-1">Quest ready</p>
                        <p className="text-xs opacity-85 mb-2">
                          Card + buttons using your colours.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm font-medium rounded-xl"
                            style={{
                              background: tokens.accent,
                              color: '#fff',
                            }}
                          >
                            Primary action
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm font-medium rounded-xl border"
                            style={{
                              background: tokens.secondary?.trim()
                                ? tokens.secondary
                                : 'transparent',
                              color: tokens.secondary?.trim()
                                ? '#1a1a1a'
                                : tokens.fg,
                              borderColor: tokens.secondary?.trim()
                                ? tokens.secondary
                                : 'rgba(128,128,128,0.45)',
                            }}
                          >
                            Secondary
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Theme name</label>
                <input
                  className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                />
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">Start from preset</label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyStartFrom(p.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-sm border transition-colors',
                        basedOn === p.id
                          ? 'border-accent bg-accent/15 text-fg'
                          : 'border-border text-muted hover:bg-nav-hover',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <ColorField
                label="Page background"
                value={tokens.page}
                onChange={(v) => setToken('page', v)}
              />
              <ColorField
                label="Sidebar"
                value={tokens.sidebar || tokens.page}
                onChange={(v) => setToken('sidebar', v)}
              />
              <ColorField
                label="Top header"
                value={tokens.header || tokens.page}
                onChange={(v) => setToken('header', v)}
              />
              <ColorField
                label="Card fill"
                value={tokens.elevated}
                onChange={(v) => setToken('elevated', v)}
              />
              <ColorField
                label="Accent"
                value={tokens.accent}
                onChange={(v) => setToken('accent', v)}
              />
              <ColorField
                label="Text"
                value={tokens.fg}
                onChange={(v) => setToken('fg', v)}
              />
              <ColorField
                label="Secondary accent"
                value={tokens.secondary || ''}
                onChange={(v) => setToken('secondary', v)}
                optional
              />

              {issues.length > 0 && (
                <div className="rounded-xl border border-border bg-inset px-3 py-2 text-sm text-muted">
                  {issues.map((i) => (
                    <p key={i}>{i}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" onClick={() => saveTheme(true)}>
                  Save &amp; apply
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => saveTheme(false)}
                >
                  Save only
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
