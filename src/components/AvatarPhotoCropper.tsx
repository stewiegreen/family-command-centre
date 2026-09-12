import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';

const OUT_SIZE = 256;
const FRAME = 280;

type Props = {
  src: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  busy?: boolean;
};

/**
 * Social-style avatar cropper: drag to pan, slider to zoom.
 * Exports a square JPEG for Avatar + flair rings.
 */
export function AvatarPhotoCropper({ src, onCancel, onConfirm, busy }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  /** Offset of image center relative to frame center (px). */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const cover =
    natural.w > 0 && natural.h > 0
      ? Math.max(FRAME / natural.w, FRAME / natural.h)
      : 1;

  const clamp = useCallback(
    (x: number, y: number, z: number) => {
      if (!natural.w || !natural.h) return { x: 0, y: 0 };
      const dw = natural.w * cover * z;
      const dh = natural.h * cover * z;
      const maxX = Math.max(0, (dw - FRAME) / 2);
      const maxY = Math.max(0, (dh - FRAME) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [natural.w, natural.h, cover],
  );

  const applyOffset = useCallback(
    (x: number, y: number, z = zoomRef.current) => {
      const next = clamp(x, y, z);
      offsetRef.current = next;
      setOffset(next);
    },
    [clamp],
  );

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    applyOffset(offsetRef.current.x, offsetRef.current.y, zoom);
  }, [zoom, applyOffset]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
      };
      el.style.cursor = 'grabbing';
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      e.preventDefault();
      applyOffset(d.originX + (e.clientX - d.startX), d.originY + (e.clientY - d.startY));
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      dragRef.current = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      el.style.cursor = 'grab';
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [applyOffset]);

  const displayW = natural.w * cover * zoom;
  const displayH = natural.h * cover * zoom;

  const exportCrop = async () => {
    const img = imgRef.current;
    if (!img || !natural.w) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const z = zoomRef.current;
    const o = offsetRef.current;
    const scale = cover * z;
    const dw = natural.w * scale;
    const dh = natural.h * scale;
    const imgLeft = (FRAME - dw) / 2 + o.x;
    const imgTop = (FRAME - dh) / 2 + o.y;
    const sx = (0 - imgLeft) / scale;
    const sy = (0 - imgTop) / scale;
    const sw = FRAME / scale;
    const sh = FRAME / scale;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_SIZE, OUT_SIZE);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    );
    if (!blob) return;
    onConfirm(blob);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Drag the photo to frame the face · use the slider to zoom
      </p>
      <div
        ref={frameRef}
        className={cn(
          'relative mx-auto overflow-hidden select-none',
          'rounded-full border-2 border-accent/60 bg-inset shadow-inner',
        )}
        style={{
          width: FRAME,
          height: FRAME,
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          onLoad={onImgLoad}
          draggable={false}
          className="absolute max-w-none pointer-events-none"
          style={{
            width: displayW || undefined,
            height: displayH || undefined,
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            willChange: 'transform',
          }}
        />
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-muted">
          <span>Zoom</span>
          <span className="tabular-nums">{zoom.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-accent h-2"
        />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" disabled={busy || !natural.w} onClick={() => void exportCrop()}>
          {busy ? 'Uploading…' : 'Use this icon'}
        </Button>
      </div>
    </div>
  );
}
