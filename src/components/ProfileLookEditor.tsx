import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { EmojiPickerPanel } from './EmojiPicker';
import { MEMBER_COLORS } from '../lib/defaults';
import { withAppearance } from '../lib/appearance';
import { cn } from '../lib/cn';
import {
  ROSTER_PACK_COUNT,
  isRosterPortraitId,
  rosterIdsForPack,
  rosterPackLabel,
  rosterPortraitPath,
} from '../lib/rosterAvatars';
import {
  COBRA_ROW_COUNT,
  cobraIdsForPack,
  cobraPackLabel,
  cobraPortraitPath,
  isCobraPortraitId,
} from '../lib/cobraAvatars';
import { isAnyPortraitId, portraitSrc } from '../lib/portraitPath';
import {
  AVATAR_FLAIR_COLORS,
  AVATAR_FLAIR_SHAPES,
  NAME_FLAIR_MAX,
  nameFlairLabel,
  sanitizeNameFlair,
} from '../lib/flair';

type Mode = 'emoji' | 'portrait';

function LookEditorBody({
  name,
  emoji,
  color,
  portraitId,
  flairShape,
  flairColor,
  nameFlairText,
  nameFlairColor,
  unlockAvatarFlair,
  unlockNameFlair,
  onEmoji,
  onColor,
  onPortrait,
  onFlairShape,
  onFlairColor,
  onNameFlairText,
  onNameFlairColor,
  mode,
  setMode,
  pack,
  setPack,
  portraitLib,
  setPortraitLib,
}: {
  name: string;
  emoji: string;
  color: string;
  portraitId: string | null;
  flairShape?: string;
  flairColor?: string;
  nameFlairText: string;
  nameFlairColor: string;
  unlockAvatarFlair: boolean;
  unlockNameFlair: boolean;
  onEmoji: (e: string) => void;
  onColor: (c: string) => void;
  onPortrait: (id: string | null) => void;
  onFlairShape: (s: string) => void;
  onFlairColor: (c: string) => void;
  onNameFlairText: (t: string) => void;
  onNameFlairColor: (c: string) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  pack: number;
  setPack: (p: number) => void;
  portraitLib: 'roster' | 'cobra';
  setPortraitLib: (l: 'roster' | 'cobra') => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-1">
        <Avatar
          name={name}
          emoji={emoji}
          color={color}
          avatarPortraitId={portraitId}
          avatarFlairShape={flairShape}
          avatarFlairColor={flairColor}
          size="lg"
          className="!w-24 !h-24 !text-5xl"
        />
        <p className="text-sm font-semibold text-fg">{name}</p>
        {nameFlairLabel(nameFlairText) ? (
          <p
            className={cn('text-xs font-medium', !nameFlairColor && 'text-accent')}
            style={nameFlairColor ? { color: nameFlairColor } : undefined}
          >
            {nameFlairLabel(nameFlairText)}
          </p>
        ) : null}
      </div>

      <div className="flex rounded-xl border border-border-strong overflow-hidden">
        <button
          type="button"
          className={cn(
            'flex-1 py-2 text-sm font-medium',
            mode === 'emoji' ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
          )}
          onClick={() => setMode('emoji')}
        >
          Emoji
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 py-2 text-sm font-medium',
            mode === 'portrait' ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
          )}
          onClick={() => setMode('portrait')}
        >
          Portrait
        </button>
      </div>

      {mode === 'emoji' ? (
        <>
          <div>
            <p className="text-xs text-muted mb-2">Emoji — pick any</p>
            <EmojiPickerPanel
              selected={emoji}
              onPick={(e) => {
                onEmoji(e);
                onPortrait(null);
              }}
              tall
            />
          </div>
          <div>
            <p className="text-xs text-muted mb-2">Background colour</p>
            <div className="flex flex-wrap gap-2">
              {MEMBER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColor(c)}
                  className={cn(
                    'w-9 h-9 rounded-full border-2 transition-transform',
                    color === c
                      ? 'border-fg scale-110 ring-2 ring-fg/30'
                      : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              className={cn(
                'flex-1 py-1.5 text-xs font-medium',
                portraitLib === 'roster' ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
              )}
              onClick={() => {
                setPortraitLib('roster');
                setPack(1);
              }}
            >
              Roster
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 py-1.5 text-xs font-medium',
                portraitLib === 'cobra' ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
              )}
              onClick={() => {
                setPortraitLib('cobra');
                setPack(1);
              }}
            >
              Cobra
            </button>
          </div>
          <p className="text-xs text-muted">
            {portraitLib === 'cobra'
              ? '182 Cobra / G.I. Joe heads — works with avatar flair borders.'
              : '200 roster faces in 10 sets — works with avatar flair borders.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {portraitLib === 'roster'
              ? Array.from({ length: ROSTER_PACK_COUNT }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPack(p)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border',
                      pack === p
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border text-muted hover:border-accent/40',
                    )}
                  >
                    {rosterPackLabel(p)}
                  </button>
                ))
              : Array.from({ length: COBRA_ROW_COUNT }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPack(p)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border',
                      pack === p
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border text-muted hover:border-accent/40',
                    )}
                  >
                    {cobraPackLabel(p)}
                  </button>
                ))}
          </div>
          <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto p-0.5">
            {(portraitLib === 'roster' ? rosterIdsForPack(pack) : cobraIdsForPack(pack)).map(
              (id) => {
                const selected = portraitId === id;
                const src =
                  portraitLib === 'roster' ? rosterPortraitPath(id) : cobraPortraitPath(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onPortrait(id)}
                    className={cn(
                      'aspect-square rounded-xl overflow-hidden border-2 transition-transform bg-white',
                      selected
                        ? 'border-accent ring-2 ring-accent/40 scale-[1.03]'
                        : 'border-border hover:border-accent/50',
                    )}
                  >
                    <img
                      src={src}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </button>
                );
              },
            )}
          </div>
          {isAnyPortraitId(portraitId) && (
            <button
              type="button"
              className="text-xs text-muted hover:text-fg underline"
              onClick={() => onPortrait(null)}
            >
              Clear portrait (use emoji instead)
            </button>
          )}
        </div>
      )}

      {/* Avatar flair — unlocked via ChoreQuest shop */}
      {unlockAvatarFlair ? (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-sm font-semibold text-fg">Avatar flair</p>
          <p className="text-xs text-muted">Shape and glow ring around your face.</p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_FLAIR_SHAPES.map((s) => {
              const active = (flairShape || 'circle') === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onFlairShape(s.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-sm border',
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border text-muted hover:border-accent/40',
                  )}
                >
                  <span className="mr-1">{s.preview}</span>
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {AVATAR_FLAIR_COLORS.map((c) => {
              const active = (flairColor || '') === (c.hex || '');
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onFlairColor(c.hex || '')}
                  className={cn(
                    'w-8 h-8 rounded-full border-2',
                    active ? 'border-fg scale-110 ring-2 ring-fg/30' : 'border-transparent',
                    !c.hex && 'bg-inset text-[10px] text-muted',
                  )}
                  style={c.hex ? { backgroundColor: c.hex } : undefined}
                  title={c.label}
                >
                  {!c.hex ? 'Off' : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted border-t border-border pt-2">
          Unlock <span className="font-medium text-fg">Avatar flair</span> in the ChoreQuest shop
          for frame shapes and glow colours.
        </p>
      )}

      {/* Name flair */}
      {unlockNameFlair ? (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-sm font-semibold text-fg">Name flair</p>
          <p className="text-xs text-muted">
            A short title under your real name (max {NAME_FLAIR_MAX} characters). Does not change
            your profile name.
          </p>
          <Input
            value={nameFlairText}
            maxLength={NAME_FLAIR_MAX}
            placeholder="e.g. Pirate King"
            onChange={(e) => onNameFlairText(sanitizeNameFlair(e.target.value))}
          />
          <p className="text-[11px] text-faint text-right">
            {nameFlairText.length}/{NAME_FLAIR_MAX}
          </p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_FLAIR_COLORS.map((c) => {
              const active = (nameFlairColor || '') === (c.hex || '');
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNameFlairColor(c.hex || '')}
                  className={cn(
                    'w-8 h-8 rounded-full border-2',
                    active ? 'border-fg scale-110 ring-2 ring-fg/30' : 'border-transparent',
                    !c.hex && 'bg-inset text-[10px] text-muted',
                  )}
                  style={c.hex ? { backgroundColor: c.hex } : undefined}
                  title={c.label}
                >
                  {!c.hex ? 'Off' : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted border-t border-border pt-2">
          Unlock <span className="font-medium text-fg">Name flair</span> in the ChoreQuest shop for a
          custom title under your name.
        </p>
      )}
    </div>
  );
}

function useLookEditorState() {
  const { data, update, currentUser } = useApp();
  const look = currentUser ? withAppearance(currentUser, data) : null;
  const app = currentUser ? data.appearance?.[currentUser.id] : undefined;
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState('😀');
  const [color, setColor] = useState('#6366f1');
  const [portraitId, setPortraitId] = useState<string | null>(null);
  const [flairShape, setFlairShape] = useState('circle');
  const [flairColor, setFlairColor] = useState('');
  const [nameFlairText, setNameFlairText] = useState('');
  const [nameFlairColor, setNameFlairColor] = useState('');
  const [mode, setMode] = useState<Mode>('emoji');
  const [pack, setPack] = useState(1);
  const [portraitLib, setPortraitLib] = useState<'roster' | 'cobra'>('roster');

  const openEditor = () => {
    if (!currentUser) return;
    const l = withAppearance(currentUser, data);
    const a = data.appearance?.[currentUser.id];
    setEmoji(l.emoji || '😀');
    setColor(l.color || '#6366f1');
    const pid = l.avatarPortraitId || null;
    setPortraitId(pid);
    setMode(pid ? 'portrait' : 'emoji');
    if (isCobraPortraitId(pid)) {
      setPortraitLib('cobra');
      const m = /^cobra_(\d{2})_/.exec(pid!);
      setPack(Math.max(1, m ? parseInt(m[1], 10) : 1));
    } else if (pid && /^\d{2}_/.test(pid)) {
      setPortraitLib('roster');
      setPack(Math.max(1, parseInt(pid.slice(0, 2), 10) || 1));
    }
    setFlairShape(a?.avatarFlairShape || l.avatarFlairShape || 'circle');
    setFlairColor(a?.avatarFlairColor || l.avatarFlairColor || '');
    setNameFlairText(a?.nameFlairText || l.nameFlairText || '');
    setNameFlairColor(a?.nameFlairColor || l.nameFlairColor || '');
    setOpen(true);
  };

  const save = () => {
    if (!currentUser) return;
    update((d) => {
      const prev = d.appearance?.[currentUser.id] || {};
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [currentUser.id]: {
            ...prev,
            emoji,
            color,
            avatarPortraitId: portraitId || null,
            avatarFlairShape: flairShape || 'circle',
            avatarFlairColor: flairColor || undefined,
            nameFlairText: nameFlairText.trim() || undefined,
            nameFlairColor: nameFlairColor || undefined,
          },
        },
      };
    });
    setOpen(false);
  };

  return {
    currentUser,
    look,
    unlockAvatarFlair: !!app?.unlockAvatarFlair,
    unlockNameFlair: !!app?.unlockNameFlair,
    open,
    setOpen,
    emoji,
    setEmoji,
    color,
    setColor,
    portraitId,
    setPortraitId,
    flairShape,
    setFlairShape,
    flairColor,
    setFlairColor,
    nameFlairText,
    setNameFlairText,
    nameFlairColor,
    setNameFlairColor,
    mode,
    setMode,
    pack,
    setPack,
    portraitLib,
    setPortraitLib,
    openEditor,
    save,
  };
}

function EditorModal({ s }: { s: ReturnType<typeof useLookEditorState> }) {
  if (!s.currentUser || !s.look) return null;
  return (
    <Modal open={s.open} onClose={() => s.setOpen(false)} title="Your look" wide>
      <LookEditorBody
        name={s.currentUser.name}
        emoji={s.emoji}
        color={s.color}
        portraitId={s.portraitId}
        flairShape={s.flairShape}
        flairColor={s.flairColor}
        nameFlairText={s.nameFlairText}
        nameFlairColor={s.nameFlairColor}
        unlockAvatarFlair={s.unlockAvatarFlair}
        unlockNameFlair={s.unlockNameFlair}
        onEmoji={s.setEmoji}
        onColor={s.setColor}
        onPortrait={s.setPortraitId}
        onFlairShape={s.setFlairShape}
        onFlairColor={s.setFlairColor}
        onNameFlairText={s.setNameFlairText}
        onNameFlairColor={s.setNameFlairColor}
        mode={s.mode}
        setMode={s.setMode}
        pack={s.pack}
        setPack={s.setPack}
        portraitLib={s.portraitLib}
        setPortraitLib={s.setPortraitLib}
      />
      <Button className="w-full mt-4" onClick={s.save}>
        Save look
      </Button>
    </Modal>
  );
}

export function ProfileLookEditor() {
  const s = useLookEditorState();
  if (!s.currentUser || !s.look) return null;

  return (
    <>
      <button
        type="button"
        onClick={s.openEditor}
        className="flex items-center gap-2 text-left group"
        title="Change your look"
      >
        <Avatar
          {...s.look}
          size="sm"
          className="ring-2 ring-transparent group-hover:ring-accent/50 transition"
        />
        <span className="text-xs text-muted group-hover:text-accent hidden sm:inline">
          Edit look
        </span>
      </button>
      <EditorModal s={s} />
    </>
  );
}

/** Compact card for dashboard — opens the same full look editor. */
export function ProfileLookCard() {
  const s = useLookEditorState();
  if (!s.currentUser || !s.look) return null;

  return (
    <>
      <Card className="!p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-fg text-sm">Your look</h2>
            <p className="text-xs text-muted">
              Emoji, portrait
              {s.unlockAvatarFlair || s.unlockNameFlair ? ', and flair' : ''}
            </p>
          </div>
          <Avatar {...s.look} size="md" className="!text-2xl" />
        </div>

        <button
          type="button"
          onClick={s.openEditor}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-border bg-inset hover:bg-nav-hover transition-colors"
        >
          {portraitSrc(s.look.avatarPortraitId) ? (
            <img
              src={portraitSrc(s.look.avatarPortraitId)!}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <span className="text-4xl leading-none">{s.look.emoji || '😀'}</span>
          )}
          <span className="text-sm text-muted">Tap to change look</span>
        </button>
      </Card>
      <EditorModal s={s} />
    </>
  );
}
