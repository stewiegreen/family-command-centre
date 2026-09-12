import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { EmojiPickerPanel } from './EmojiPicker';
import { AvatarPhotoCropper } from './AvatarPhotoCropper';
import { getFirebaseAuth } from '../lib/firebase';
import { MEMBER_COLORS } from '../lib/defaults';
import { withAppearance } from '../lib/appearance';
import { cn } from '../lib/cn';
import {
  ROSTER_PACK_COUNT,
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
import {
  FAN_PACKS,
  fanIdsForPack,
  fanPackFromId,
  fanPortraitPath,
  isFanPortraitId,
  type FanPackId,
} from '../lib/fanAvatars';
import {
  JOE_ROW_COUNT,
  joeIdsForPack,
  joePackLabel,
  joePortraitPath,
  isJoePortraitId,
} from '../lib/joeAvatars';
import { isAnyPortraitId, portraitSrc } from '../lib/portraitPath';

type PortraitLib = 'roster' | 'cobra' | 'joe' | FanPackId;
import {
  AVATAR_FLAIR_COLORS,
  AVATAR_FLAIR_SHAPES,
  NAME_FLAIR_MAX,
  nameFlairLabel,
  sanitizeNameFlair,
} from '../lib/flair';

type Mode = 'emoji' | 'portrait' | 'photo';

function LookEditorBody({
  name,
  emoji,
  color,
  portraitId,
  customUrl,
  onCustomUrl,
  familyId,
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
  customUrl: string | null;
  onCustomUrl: (url: string | null) => void;
  familyId?: string;
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
  portraitLib: PortraitLib;
  setPortraitLib: (l: PortraitLib) => void;
}) {
  const [flairPanel, setFlairPanel] = useState<null | 'avatar' | 'name'>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const onPickPhoto = (file: File | null) => {
    if (!file) return;
    setUploadErr('');
    if (!file.type.startsWith('image/')) {
      setUploadErr('Please choose an image file.');
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
  };

  const onCropConfirm = async (blob: Blob) => {
    setUploadBusy(true);
    setUploadErr('');
    try {
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      if (!user) {
        setUploadErr('Sign in required to upload.');
        return;
      }
      const idToken = await user.getIdToken();
      const form = new FormData();
      form.append('photo', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      if (familyId) form.append('familyId', familyId);
      const res = await fetch('/api/messages-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setUploadErr(body.error || `Upload failed (${res.status})`);
        return;
      }
      onCustomUrl(body.url);
      onPortrait(null);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Avatar with flair shortcuts on either side */}
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        <div className="w-[5.5rem] sm:w-28 flex justify-end shrink-0">
          {unlockAvatarFlair ? (
            <button
              type="button"
              onClick={() => setFlairPanel('avatar')}
              className="text-left text-xs sm:text-sm font-medium text-accent hover:underline leading-tight max-w-[5.5rem] sm:max-w-[7rem]"
            >
              Avatar flair
              {(flairColor || (flairShape && flairShape !== 'circle')) && (
                <span className="block text-[10px] text-muted font-normal no-underline">Tap to edit</span>
              )}
            </button>
          ) : (
            <span className="text-[10px] sm:text-xs text-faint text-right leading-tight">
              Avatar flair
              <span className="block">locked</span>
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          <Avatar
            name={name}
            emoji={emoji}
            color={color}
            avatarPortraitId={portraitId}
            avatarCustomUrl={customUrl}
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

        <div className="w-[5.5rem] sm:w-28 flex justify-start shrink-0">
          {unlockNameFlair ? (
            <button
              type="button"
              onClick={() => setFlairPanel('name')}
              className="text-left text-xs sm:text-sm font-medium text-accent hover:underline leading-tight max-w-[5.5rem] sm:max-w-[7rem]"
            >
              Name flair
              {nameFlairLabel(nameFlairText) && (
                <span className="block text-[10px] text-muted font-normal truncate">
                  {nameFlairLabel(nameFlairText)}
                </span>
              )}
            </button>
          ) : (
            <span className="text-[10px] sm:text-xs text-faint leading-tight">
              Name flair
              <span className="block">locked</span>
            </span>
          )}
        </div>
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
        <button
          type="button"
          className={cn(
            'flex-1 py-2 text-sm font-medium',
            mode === 'photo' ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
          )}
          onClick={() => setMode('photo')}
        >
          Photo
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
                onCustomUrl(null);
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
      ) : mode === 'portrait' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'roster' as PortraitLib, label: 'Transformers' },
                { id: 'cobra' as PortraitLib, label: 'Cobra' },
                { id: 'joe' as PortraitLib, label: 'G.I. Joe' },
                ...FAN_PACKS.map((p) => ({ id: p.id as PortraitLib, label: p.label })),
              ] as { id: PortraitLib; label: string }[]
            ).map((lib) => (
              <button
                key={lib.id}
                type="button"
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium border',
                  portraitLib === lib.id
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-border text-muted hover:border-accent/40',
                )}
                onClick={() => {
                  setPortraitLib(lib.id);
                  setPack(1);
                }}
              >
                {lib.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            {portraitLib === 'cobra'
              ? '182 Cobra heads — works with avatar flair.'
              : portraitLib === 'joe'
                ? '220 G.I. Joe heads — works with avatar flair.'
                : portraitLib === 'roster'
                  ? 'Transformers faces in 10 sets — works with avatar flair.'
                  : portraitLib === 'ntd'
                    ? '26 Nintendo faces — works with avatar flair.'
                    : portraitLib === 'spy'
                      ? '15 Spy×Family faces — works with avatar flair.'
                      : '17 One Piece faces — works with avatar flair.'}
          </p>
          {(portraitLib === 'roster' || portraitLib === 'cobra' || portraitLib === 'joe') && (
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
                : portraitLib === 'cobra'
                  ? Array.from({ length: COBRA_ROW_COUNT }, (_, i) => i + 1).map((p) => (
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
                    ))
                  : Array.from({ length: JOE_ROW_COUNT }, (_, i) => i + 1).map((p) => (
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
                        {joePackLabel(p)}
                      </button>
                    ))}
            </div>
          )}
          <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto p-0.5">
            {(portraitLib === 'roster'
              ? rosterIdsForPack(pack)
              : portraitLib === 'cobra'
                ? cobraIdsForPack(pack)
                : portraitLib === 'joe'
                  ? joeIdsForPack(pack)
                  : fanIdsForPack(portraitLib)
            ).map((id) => {
              const selected = portraitId === id;
              const src =
                portraitLib === 'roster'
                  ? rosterPortraitPath(id)
                  : portraitLib === 'cobra'
                    ? cobraPortraitPath(id)
                    : portraitLib === 'joe'
                      ? joePortraitPath(id)
                      : fanPortraitPath(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onPortrait(id);
                    onCustomUrl(null);
                  }}
                  className={cn(
                    'aspect-square rounded-xl overflow-hidden border-2 transition-transform',
                    'bg-[#e8e8ec]',
                    selected
                      ? 'border-accent ring-2 ring-accent/40 scale-[1.03]'
                      : 'border-border hover:border-accent/50',
                  )}
                >
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full object-contain"
                    draggable={false}
                    loading="lazy"
                  />
                </button>
              );
            })}
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
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Upload any photo, then zoom and drag until the face fills the circle — same idea as a
            profile picture on social apps.
          </p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
          />
          {!cropSrc ? (
            <div className="space-y-2">
              {customUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <Avatar
                    name={name}
                    emoji={emoji}
                    color={color}
                    avatarCustomUrl={customUrl}
                    avatarFlairShape={flairShape}
                    avatarFlairColor={flairColor}
                    size="lg"
                    className="!w-20 !h-20"
                  />
                  <p className="text-xs text-muted">Current photo icon</p>
                </div>
              ) : null}
              <Button className="w-full" onClick={() => photoInputRef.current?.click()}>
                Choose photo
              </Button>
              {customUrl ? (
                <button
                  type="button"
                  className="w-full text-xs text-muted hover:text-fg underline"
                  onClick={() => onCustomUrl(null)}
                >
                  Remove photo icon
                </button>
              ) : null}
            </div>
          ) : (
            <AvatarPhotoCropper
              src={cropSrc}
              busy={uploadBusy}
              onCancel={() => {
                if (cropSrc) URL.revokeObjectURL(cropSrc);
                setCropSrc(null);
              }}
              onConfirm={(blob) => void onCropConfirm(blob)}
            />
          )}
          {uploadErr ? <p className="text-xs text-red-500">{uploadErr}</p> : null}
        </div>
      )}


      {(!unlockAvatarFlair || !unlockNameFlair) && (
        <p className="text-xs text-muted border-t border-border pt-2">
          {!unlockAvatarFlair && !unlockNameFlair
            ? 'Unlock Avatar flair and Name flair in the ChoreQuest shop.'
            : !unlockAvatarFlair
              ? 'Unlock Avatar flair in the ChoreQuest shop for frame shapes and glow colours.'
              : 'Unlock Name flair in the ChoreQuest shop for a custom title under your name.'}
        </p>
      )}

      {/* Avatar flair editor */}
      <Modal
        open={flairPanel === 'avatar'}
        onClose={() => setFlairPanel(null)}
        title="Avatar flair"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">Shape and glow ring around your face.</p>
          <div className="flex justify-center py-2">
            <Avatar
              name={name}
              emoji={emoji}
              color={color}
              avatarPortraitId={portraitId}
              avatarCustomUrl={customUrl}
              avatarFlairShape={flairShape}
              avatarFlairColor={flairColor}
              size="lg"
              className="!w-20 !h-20 !text-4xl"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {AVATAR_FLAIR_SHAPES.map((s) => {
              const active = (flairShape || 'circle') === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onFlairShape(s.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-sm border flex items-center gap-1.5',
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border text-muted hover:border-accent/40',
                  )}
                >
                  <span aria-hidden>{s.preview}</span>
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
          <Button className="w-full" onClick={() => setFlairPanel(null)}>
            Done
          </Button>
        </div>
      </Modal>

      {/* Name flair editor */}
      <Modal
        open={flairPanel === 'name'}
        onClose={() => setFlairPanel(null)}
        title="Name flair"
      >
        <div className="space-y-3">
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
          <Button className="w-full" onClick={() => setFlairPanel(null)}>
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function useLookEditorState() {
  const { data, update, currentUser, familyId } = useApp();
  const look = currentUser ? withAppearance(currentUser, data) : null;
  const app = currentUser ? data.appearance?.[currentUser.id] : undefined;
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState('😀');
  const [color, setColor] = useState('#6366f1');
  const [portraitId, setPortraitId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [flairShape, setFlairShape] = useState('circle');
  const [flairColor, setFlairColor] = useState('');
  const [nameFlairText, setNameFlairText] = useState('');
  const [nameFlairColor, setNameFlairColor] = useState('');
  const [mode, setMode] = useState<Mode>('emoji');
  const [pack, setPack] = useState(1);
  const [portraitLib, setPortraitLib] = useState<PortraitLib>('roster');

  const openEditor = () => {
    if (!currentUser) return;
    const l = withAppearance(currentUser, data);
    const a = data.appearance?.[currentUser.id];
    setEmoji(l.emoji || '😀');
    setColor(l.color || '#6366f1');
    const pid = l.avatarPortraitId || null;
    const curl = (l.avatarCustomUrl || null) as string | null;
    setPortraitId(pid);
    setCustomUrl(curl);
    setMode(curl ? 'photo' : pid ? 'portrait' : 'emoji');
    if (isCobraPortraitId(pid)) {
      setPortraitLib('cobra');
      const m = /^cobra_(\d{2})_/.exec(pid!);
      setPack(Math.max(1, m ? parseInt(m[1], 10) : 1));
    } else if (isJoePortraitId(pid)) {
      setPortraitLib('joe');
      const m = /^joe_(\d{2})_/.exec(pid!);
      setPack(Math.max(1, m ? parseInt(m[1], 10) : 1));
    } else if (isFanPortraitId(pid)) {
      const fp = fanPackFromId(pid!) || 'ntd';
      setPortraitLib(fp);
      setPack(1);
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
            avatarPortraitId: mode === 'portrait' ? portraitId || null : null,
            avatarCustomUrl: mode === 'photo' ? customUrl || null : null,
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
    familyId,
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
    customUrl,
    setCustomUrl,
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
        customUrl={s.customUrl}
        onCustomUrl={s.setCustomUrl}
        familyId={s.familyId}
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
