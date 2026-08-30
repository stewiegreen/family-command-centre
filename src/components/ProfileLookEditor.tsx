import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { MEMBER_COLORS, MEMBER_EMOJIS } from '../lib/defaults';
import { withAppearance } from '../lib/appearance';
import { cn } from '../lib/cn';

export function ProfileLookEditor() {
  const { data, update, currentUser } = useApp();
  const [open, setOpen] = useState(false);
  if (!currentUser) return null;

  const look = withAppearance(currentUser, data);
  const [emoji, setEmoji] = useState(look.emoji || '😀');
  const [color, setColor] = useState(look.color);

  const openEditor = () => {
    const l = withAppearance(currentUser, data);
    setEmoji(l.emoji || '😀');
    setColor(l.color);
    setOpen(true);
  };

  const save = () => {
    update((d) => ({
      ...d,
      appearance: {
        ...(d.appearance || {}),
        [currentUser.id]: { emoji, color },
      },
    }));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="flex items-center gap-2 text-left group"
        title="Change your emoji & colour"
      >
        <Avatar {...look} size="sm" className="ring-2 ring-transparent group-hover:ring-accent/50 transition" />
        <span className="text-xs text-muted group-hover:text-accent hidden sm:inline">Edit look</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Your look">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Avatar name={currentUser.name} emoji={emoji} color={color} size="lg" className="!w-16 !h-16 !text-2xl" />
          </div>
          <div>
            <p className="text-xs text-muted mb-2">Emoji</p>
            <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto p-1 rounded-xl bg-inset border border-border">
              {MEMBER_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'w-9 h-9 text-xl rounded-lg flex items-center justify-center',
                    emoji === e ? 'bg-accent/20 ring-2 ring-accent' : 'hover:bg-nav-hover',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-2">Colour</p>
            <div className="flex flex-wrap gap-2">
              {MEMBER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-8 h-8 rounded-full border-2',
                    color === c ? 'border-fg scale-110' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={save}>
            Save look
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** Compact card for dashboard. */
export function ProfileLookCard() {
  const { data, update, currentUser } = useApp();
  if (!currentUser) return null;
  const look = withAppearance(currentUser, data);

  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-fg text-sm">Your look</h2>
          <p className="text-xs text-muted">Pick an emoji and colour — kids love this.</p>
        </div>
        <Avatar {...look} size="md" />
      </div>
      <p className="text-xs text-muted mb-2">Emoji</p>
      <div className="flex flex-wrap gap-1.5 mb-3 max-h-24 overflow-y-auto">
        {MEMBER_EMOJIS.slice(0, 24).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() =>
              update((d) => ({
                ...d,
                appearance: {
                  ...(d.appearance || {}),
                  [currentUser.id]: {
                    emoji: e,
                    color: d.appearance?.[currentUser.id]?.color || look.color,
                  },
                },
              }))
            }
            className={cn(
              'w-9 h-9 text-lg rounded-xl flex items-center justify-center border',
              look.emoji === e ? 'border-accent bg-accent/15' : 'border-border hover:bg-nav-hover',
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mb-2">Colour</p>
      <div className="flex flex-wrap gap-2">
        {MEMBER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() =>
              update((d) => ({
                ...d,
                appearance: {
                  ...(d.appearance || {}),
                  [currentUser.id]: {
                    emoji: d.appearance?.[currentUser.id]?.emoji || look.emoji,
                    color: c,
                  },
                },
              }))
            }
            className={cn('w-7 h-7 rounded-full border-2', look.color === c ? 'border-fg scale-110' : 'border-transparent')}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </Card>
  );
}
