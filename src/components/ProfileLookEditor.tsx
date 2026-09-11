import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
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

type Mode = 'emoji' | 'portrait';

function LookEditorBody({
  name,
  emoji,
  color,
  portraitId,
  flairShape,
  flairColor,
  onEmoji,
  onColor,
  onPortrait,
  mode,
  setMode,
  pack,
  setPack,
}: {
  name: string;
  emoji: string;
  color: string;
  portraitId: string | null;
  flairShape?: string;
  flairColor?: string;
  onEmoji: (e: string) => void;
  onColor: (c: string) => void;
  onPortrait: (id: string | null) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  pack: number;
  setPack: (p: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
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
          <p className="text-xs text-muted">
            200 roster faces in 10 sets — works with avatar flair borders.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: ROSTER_PACK_COUNT }, (_, i) => i + 1).map((p) => (
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
            ))}
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto p-0.5">
            {rosterIdsForPack(pack).map((id) => {
              const selected = portraitId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPortrait(id)}
                  className={cn(
                    'aspect-square rounded-xl overflow-hidden border-2 transition-transform',
                    selected
                      ? 'border-accent ring-2 ring-accent/40 scale-[1.03]'
                      : 'border-border hover:border-accent/50',
                  )}
                >
                  <img
                    src={rosterPortraitPath(id)}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
          {isRosterPortraitId(portraitId) && (
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
    </div>
  );
}

function useLookEditorState() {
  const { data, update, currentUser } = useApp();
  const look = currentUser ? withAppearance(currentUser, data) : null;
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState('😀');
  const [color, setColor] = useState('#6366f1');
  const [portraitId, setPortraitId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('emoji');
  const [pack, setPack] = useState(1);

  const openEditor = () => {
    if (!currentUser) return;
    const l = withAppearance(currentUser, data);
    setEmoji(l.emoji || '😀');
    setColor(l.color || '#6366f1');
    const pid = l.avatarPortraitId || null;
    setPortraitId(pid);
    setMode(pid ? 'portrait' : 'emoji');
    if (pid && /^\d{2}_/.test(pid)) {
      setPack(Math.max(1, parseInt(pid.slice(0, 2), 10) || 1));
    }
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
            // empty string clears in UI; store null to mean none
            avatarPortraitId: portraitId || null,
          },
        },
      };
    });
    setOpen(false);
  };

  return {
    currentUser,
    look,
    open,
    setOpen,
    emoji,
    setEmoji,
    color,
    setColor,
    portraitId,
    setPortraitId,
    mode,
    setMode,
    pack,
    setPack,
    openEditor,
    save,
  };
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

      <Modal open={s.open} onClose={() => s.setOpen(false)} title="Your look" wide>
        <LookEditorBody
          name={s.currentUser.name}
          emoji={s.emoji}
          color={s.color}
          portraitId={s.portraitId}
          flairShape={s.look.avatarFlairShape}
          flairColor={s.look.avatarFlairColor}
          onEmoji={s.setEmoji}
          onColor={s.setColor}
          onPortrait={s.setPortraitId}
          mode={s.mode}
          setMode={s.setMode}
          pack={s.pack}
          setPack={s.setPack}
        />
        <Button className="w-full mt-4" onClick={s.save}>
          Save look
        </Button>
      </Modal>
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
            <p className="text-xs text-muted">Emoji or portrait — flair still applies.</p>
          </div>
          <Avatar {...s.look} size="md" className="!text-2xl" />
        </div>

        <button
          type="button"
          onClick={s.openEditor}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-border bg-inset hover:bg-nav-hover transition-colors"
        >
          {isRosterPortraitId(s.look.avatarPortraitId) ? (
            <img
              src={rosterPortraitPath(s.look.avatarPortraitId!)}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <span className="text-4xl leading-none">{s.look.emoji || '😀'}</span>
          )}
          <span className="text-sm text-muted">Tap to change look</span>
        </button>
      </Card>

      <Modal open={s.open} onClose={() => s.setOpen(false)} title="Your look" wide>
        <LookEditorBody
          name={s.currentUser.name}
          emoji={s.emoji}
          color={s.color}
          portraitId={s.portraitId}
          flairShape={s.look.avatarFlairShape}
          flairColor={s.look.avatarFlairColor}
          onEmoji={s.setEmoji}
          onColor={s.setColor}
          onPortrait={s.setPortraitId}
          mode={s.mode}
          setMode={s.setMode}
          pack={s.pack}
          setPack={s.setPack}
        />
        <Button className="w-full mt-4" onClick={s.save}>
          Save look
        </Button>
      </Modal>
    </>
  );
}
