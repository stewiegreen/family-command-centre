import { useRef, useState } from 'react';
import { Frame, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getFirebaseAuth } from '../lib/firebase';
import { cn } from '../lib/cn';

/** Resize to fit a dashboard card, keep aspect, output JPEG. */
async function resizeForFrame(file: File, maxW = 720, maxH = 540): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
      'image/jpeg',
      0.88,
    );
  });
}

export function PictureFrameCard() {
  const { data, update, currentUser, familyId } = useApp();
  const myId = currentUser?.id;
  const app = myId ? data.appearance?.[myId] : undefined;
  const unlocked = !!app?.unlockPictureFrame;
  const url = app?.pictureFrameUrl;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!myId) return null;

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Frame className="w-8 h-8 text-muted" />
        <p className="text-sm text-muted">
          Unlock a picture frame in the ChoreQuest shop to pin a photo here.
        </p>
      </div>
    );
  }

  const saveUrl = (nextUrl: string | undefined) => {
    update((d) => {
      const prev = d.appearance?.[myId] || {};
      return {
        ...d,
        appearance: {
          ...(d.appearance || {}),
          [myId]: { ...prev, pictureFrameUrl: nextUrl },
        },
      };
    });
  };

  const onPick = async (file: File | null) => {
    if (!file) return;
    setErr('');
    setBusy(true);
    try {
      if (!file.type.startsWith('image/')) {
        setErr('Please choose an image file.');
        return;
      }
      const resized = await resizeForFrame(file);
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;
      if (!user) {
        setErr('Sign in required to upload.');
        return;
      }
      const idToken = await user.getIdToken();
      const form = new FormData();
      form.append('photo', new File([resized], 'frame.jpg', { type: 'image/jpeg' }));
      if (familyId) form.append('familyId', familyId);
      const res = await fetch('/api/messages-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setErr(body.error || `Upload failed (${res.status})`);
        return;
      }
      saveUrl(body.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
          <Frame className="w-3.5 h-3.5" />
          My frame
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted hover:text-fg hover:bg-nav-hover disabled:opacity-50"
          >
            {url ? 'Change' : 'Upload'}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm('Remove this picture from your frame?')) saveUrl(undefined);
              }}
              className="p-1.5 rounded-lg text-muted hover:text-warn hover:bg-warn/10 disabled:opacity-50"
              title="Remove picture"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0] || null)}
      />

      {url ? (
        <div className="relative rounded-xl overflow-hidden border border-border bg-inset aspect-[4/3]">
          <img
            src={url}
            alt="My picture frame"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {busy && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'w-full aspect-[4/3] rounded-xl border-2 border-dashed border-border',
            'flex flex-col items-center justify-center gap-2 text-muted hover:border-accent/50 hover:text-fg transition-colors',
            busy && 'opacity-60 pointer-events-none',
          )}
        >
          {busy ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : (
            <ImagePlus className="w-7 h-7" />
          )}
          <span className="text-xs">{busy ? 'Uploading…' : 'Tap to add a photo'}</span>
        </button>
      )}

      {err && <p className="text-xs text-warn">{err}</p>}
    </div>
  );
}
