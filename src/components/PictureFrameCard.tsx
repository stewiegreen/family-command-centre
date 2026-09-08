import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Trash2 } from 'lucide-react';
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
      <div className="h-full min-h-[14rem] flex flex-col items-center justify-center gap-2 text-center px-4">
        <ImagePlus className="w-8 h-8 text-muted" />
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
    <div className="h-full min-h-[14rem] flex flex-col">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0] || null)}
      />

      {url ? (
        <div className="relative flex-1 min-h-[14rem] rounded-2xl overflow-hidden border border-border bg-inset">
          {/* Fill the paired row height; whole image stays visible */}
          <img
            src={url}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />

          <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg',
                'bg-black/55 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-50',
              )}
            >
              <Pencil className="w-3 h-3" />
              Change
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm('Remove this picture from your frame?')) saveUrl(undefined);
              }}
              className={cn(
                'p-1.5 rounded-lg bg-black/55 text-white backdrop-blur-sm',
                'hover:bg-red-600/80 disabled:opacity-50',
              )}
              title="Remove picture"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {busy && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
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
            'flex-1 min-h-[14rem] w-full rounded-2xl border-2 border-dashed border-border',
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

      {err && <p className="text-xs text-warn mt-1">{err}</p>}
    </div>
  );
}
