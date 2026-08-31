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

      <Modal open={open} onClose={() => setOpen(false)} title="Your look" wide>
        <div className="space-y-4">
          <div className="flex justify-center">
            <Avatar
              name={currentUser.name}
              emoji={emoji}
              color={color}
              size="lg"
              className="!w-24 !h-24 !text-5xl"
            />
          </div>

          <div>
            <p className="text-xs text-muted mb-2">Emoji — pick any</p>
            <EmojiPickerPanel
              selected={emoji}
              onPick={setEmoji}
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
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-9 h-9 rounded-full border-2 transition-transform',
                    color === c ? 'border-fg scale-110 ring-2 ring-fg/30' : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
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

/** Compact card for dashboard — opens the same full emoji + colour editor. */
export function ProfileLookCard() {
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
      <Card className="!p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-fg text-sm">Your look</h2>
            <p className="text-xs text-muted">Pick any emoji and a colour — kids love this.</p>
          </div>
          <Avatar {...look} size="md" className="!text-2xl" />
        </div>

        <button
          type="button"
          onClick={openEditor}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-border bg-inset hover:bg-nav-hover transition-colors"
        >
          <span className="text-4xl leading-none">{look.emoji || '😀'}</span>
          <span className="text-sm text-muted">Tap to change emoji & colour</span>
        </button>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Your look" wide>
        <div className="space-y-4">
          <div className="flex justify-center">
            <Avatar
              name={currentUser.name}
              emoji={emoji}
              color={color}
              size="lg"
              className="!w-24 !h-24 !text-5xl"
            />
          </div>

          <div>
            <p className="text-xs text-muted mb-2">Emoji — pick any</p>
            <EmojiPickerPanel
              selected={emoji}
              onPick={setEmoji}
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
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-9 h-9 rounded-full border-2 transition-transform',
                    color === c ? 'border-fg scale-110 ring-2 ring-fg/30' : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
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
