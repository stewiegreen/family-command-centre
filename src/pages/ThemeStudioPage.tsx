import { useMemo, useState, type CSSProperties } from 'react';
import { Palette, Lock, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { uid } from '../lib/uid';
import type { ThemeId } from '../types';
import {
  PRESET_START_TOKENS,
  applyTokenSetToElement,
  contrastIssues,
  type ThemeTokenSet,
} from '../lib/themeTokens';
import { cn } from '../lib/cn';

const PRESETS: { id: ThemeId; label: string }[] = [
  { id: 'dark', label: 'Warm dark' },
  { id: 'light', label: 'Warm light' },
  { id: 'neon', label: 'Neon' },
  { id: 'spyfamily', label: 'Spy×Family' },
];

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

export function ThemeStudioPage() {
  const { data, update, currentUser, setView } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const appearance = data.appearance?.[myId] || {};
  const unlocked = !!appearance.unlockThemeStudio;

  const currentPreset: ThemeId =
    appearance.theme || data.settings.theme || 'dark';

  const existing = appearance.customThemes?.[0];

  const [basedOn, setBasedOn] = useState<ThemeId>(
    existing?.basedOn || currentPreset,
  );
  const [name, setName] = useState(existing?.name || 'My theme');
  const [tokens, setTokens] = useState<ThemeTokenSet>(() => {
    if (existing?.tokens) return { ...existing.tokens };
    return { ...PRESET_START_TOKENS[currentPreset] };
  });
  const [msg, setMsg] = useState('');

  const issues = useMemo(() => contrastIssues(tokens), [tokens]);

  const setToken = (key: keyof ThemeTokenSet, value: string) => {
    setTokens((t) => ({ ...t, [key]: value }));
    setMsg('');
  };

  const applyStartFrom = (preset: ThemeId) => {
    setBasedOn(preset);
    setTokens({ ...PRESET_START_TOKENS[preset] });
    setMsg('');
  };

  const previewStyle = useMemo(() => {
    // Build a style object for the scoped preview (same vars Card/Button use)
    const el = document.createElement('div');
    applyTokenSetToElement(el, tokens);
    const style: Record<string, string> = {
      background: tokens.page,
      color: tokens.fg,
      padding: '1rem',
      borderRadius: '1rem',
    };
    for (const prop of [
      '--app-page',
      '--app-elevated',
      '--app-surface',
      '--app-surface-2',
      '--app-accent',
      '--app-accent-hover',
      '--app-accent-tint',
      '--app-accent-tint-strong',
      '--app-accent-ink',
      '--app-fg',
      '--app-secondary',
      '--app-border',
      '--app-muted',
    ] as const) {
      const v = el.style.getPropertyValue(prop);
      if (v) style[prop] = v;
    }
    // Ensure text tokens inside preview resolve
    style['--app-fg'] = tokens.fg;
    style['--app-muted'] = tokens.fg;
    style['--app-border'] = 'rgba(128,128,128,0.25)';
    return style as CSSProperties;
  }, [tokens]);

  const saveAndApply = () => {
    if (!unlocked || !myId) return;
    if (issues.length) {
      setMsg(issues.join(' '));
      return;
    }
    const cleanName = name.trim() || 'My theme';
    const now = new Date().toISOString();
    const slot = appearance.customThemes?.[0];

    if (slot && slot.id) {
      if (!confirm('Replace your saved theme with this one?')) return;
    }

    const id = slot?.id || uid();
    const entry = {
      id,
      name: cleanName,
      basedOn,
      tokens: {
        page: tokens.page.trim(),
        elevated: tokens.elevated.trim(),
        accent: tokens.accent.trim(),
        fg: tokens.fg.trim(),
        ...(tokens.secondary?.trim()
          ? { secondary: tokens.secondary.trim() }
          : {}),
      },
      createdAt: slot?.createdAt || now,
      updatedAt: now,
    };

    update((d) => {
      const prev = d.appearance?.[myId] || {};
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [myId]: {
            ...prev,
            customThemes: [entry],
            activeCustomThemeId: id,
            // Keep basedOn preset as the underlying class
            theme: basedOn,
          },
        },
      };
    });
    setMsg('Saved and applied!');
  };

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
            activeCustomThemeId: undefined,
          },
        },
      };
    });
    setMsg('Using plain preset — custom colours cleared.');
  };

  if (!unlocked) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
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
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Palette className="w-6 h-6 text-accent" />
        <div>
          <h1 className="text-xl font-semibold text-fg">Theme Studio</h1>
          <p className="text-sm text-muted">
            Build a custom look on top of a preset. One save slot.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Live preview — scoped only */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
            Preview
          </h2>
          <div
            className="rounded-2xl border border-border overflow-hidden"
            style={previewStyle}
          >
            <div className="p-4 space-y-3">
              <p className="text-sm font-medium" style={{ color: tokens.fg }}>
                Sample home card
              </p>
              <Card className="!shadow-none">
                <p className="text-sm font-semibold mb-1" style={{ color: tokens.fg }}>
                  Quest ready
                </p>
                <p className="text-xs mb-3 opacity-80" style={{ color: tokens.fg }}>
                  This is a real card + button using your colours.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm">
                    Primary action
                  </Button>
                  <Button type="button" size="sm" variant="secondary">
                    Secondary
                  </Button>
                </div>
              </Card>
              <div className="flex gap-2">
                {(['page', 'elevated', 'accent', 'fg'] as const).map((k) => (
                  <div
                    key={k}
                    className="w-8 h-8 rounded-lg border border-black/10"
                    style={{ background: tokens[k] }}
                    title={k}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
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
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-fg">
              {issues.map((i) => (
                <p key={i}>{i}</p>
              ))}
              <p className="text-xs text-muted mt-1">Fix contrast before saving.</p>
            </div>
          )}

          {msg && (
            <p className="text-sm text-accent flex items-center gap-1">
              {msg.startsWith('Saved') && <Check className="w-4 h-4" />}
              {msg}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              onClick={saveAndApply}
              disabled={issues.length > 0}
            >
              Save &amp; apply
            </Button>
            <Button type="button" variant="secondary" onClick={usePresetInstead}>
              Use a preset instead
            </Button>
          </div>

          {existing && (
            <p className="text-xs text-muted">
              Saved theme: <span className="text-fg">{existing.name}</span>
              {appearance.activeCustomThemeId === existing.id
                ? ' · currently applied'
                : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
