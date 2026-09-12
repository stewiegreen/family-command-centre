import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';

const OUT_SIZE = 256;

type Props = {
  /** Object URL or data URL of the source image */
  src: string;
  onCancel: () => void;
  /** Called with a JPEG Blob ready to upload */
  onConfirm: (blob: Blob) => void;
  busy?: boolean;
};

/**
 * Social-style avatar cropper: drag to pan, slider to zoom, circular preview.
 * Exports a square JPEG suitable for Avatar (works with flair rings).
 */
export function AvatarPhotoCropper({ src, onCancel, onConfirm, busy }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Cover scale so image fills the crop square at zoom=1
  const frameSize = 280;
  const cover =
    natural.w && natural.h
      ? Math.max(frameSize / natural.w, frameSize / natural.h)
      : 1;
  const displayW = natural.w * cover * zoom;
  const displayH = natural.h * cover * zoom;

  const clampOffset = useCallback(
    (x: number, y: number, z: number) => {
      const dw = natural.w * cover * z;
      const dh = natural.h * cover * z;
      const maxX = Math.max(0, (dw - frameSize) / 2);
      const maxY = Math.max(0, (dh - frameSize) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [natural.w, natural.h, cover],
  );

  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y, zoom));
  }, [zoom, clampOffset]);

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy, zoom));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const exportCrop = async () => {
    const img = imgRef.current;
    if (!img || !natural.w) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Map crop square back to source pixels
    const scale = cover * zoom;
    // Image is centered in frame then offset
    const imgLeft = (frameSize - displayW) / 2 + offset.x;
    const imgTop = (frameSize - displayH) / 2 + offset.y;
    // Crop window in image display coords: (0,0)-(frameSize,frameSize)
    const sx = (0 - imgLeft) / scale;
    const sy = (0 - imgTop) / scale;
    const sw = frameSize / scale;
    const sh = frameSize / scale;

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
        Drag to position · pinch-slider to zoom · crop is square (works with avatar flair)
      </p>
      <div
        ref={frameRef}
        className={cn(
          'relative mx-auto overflow-hidden touch-none select-none',
          'rounded-full border-2 border-accent/60 bg-inset shadow-inner',
        )}
        style={{ width: frameSize, height: frameSize, cursor: 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          ref={imgRef}
          src={src}
          onLoad={onImgLoad}
          draggable={false}
          className="absolute max-w-none pointer-events-none"
          style={{
            width: displayW || 'auto',
            height: displayH || 'auto',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
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
          max={3}
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
