import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicProgress({
  position,
  duration,
  onSeek,
  compact,
  className,
  /** onDark = mini/player overlays; onSurface = in-page album (theme tokens) */
  tone = 'onDark',
}: {
  position: number;
  duration: number;
  onSeek?: (seconds: number) => void;
  compact?: boolean;
  className?: string;
  tone?: 'onDark' | 'onSurface';
}) {
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState(0);
  const wasDragging = useRef(false);

  const max = Math.max(duration > 0 ? duration : 0, 0.1);
  const shown = dragging ? draft : Math.min(position, max);
  const pct = Math.min(100, (shown / max) * 100);

  useEffect(() => {
    if (!dragging) setDraft(position);
  }, [position, dragging]);

  const commit = (value: number) => {
    const t = Math.max(0, Math.min(value, max));
    setDraft(t);
    onSeek?.(t);
  };

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      {!compact && (
        <span
          className={cn(
            'text-[10px] tabular-nums w-8 text-right shrink-0',
            tone === 'onDark' ? 'text-white/50' : 'text-muted',
          )}
        >
          {formatTime(shown)}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={shown}
        onPointerDown={() => {
          wasDragging.current = true;
          setDragging(true);
        }}
        onPointerUp={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          setDragging(false);
          wasDragging.current = false;
          commit(v);
        }}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft(v);
          // Live seek while dragging (debounced by browser input rate)
          if (dragging || wasDragging.current) setDraft(v);
          else commit(v);
        }}
        className={cn(
          'flex-1 min-w-0 h-1 appearance-none rounded-full cursor-pointer',
          tone === 'onDark' ? 'bg-white/15' : 'bg-border',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5',
          '[&::-webkit-slider-thumb]:rounded-full',
          tone === 'onDark'
            ? '[&::-webkit-slider-thumb]:bg-white'
            : '[&::-webkit-slider-thumb]:bg-fg',
          '[&::-webkit-slider-thumb]:shadow',
        )}
        style={{
          background:
            tone === 'onDark'
              ? `linear-gradient(to right, rgb(52 211 153) ${pct}%, rgba(255,255,255,0.15) ${pct}%)`
              : `linear-gradient(to right, rgb(16 185 129) ${pct}%, var(--color-border, rgba(0,0,0,0.12)) ${pct}%)`,
        }}
        aria-label="Seek"
      />
      {!compact && (
        <span
          className={cn(
            'text-[10px] tabular-nums w-8 shrink-0',
            tone === 'onDark' ? 'text-white/50' : 'text-muted',
          )}
        >
          {formatTime(duration)}
        </span>
      )}
    </div>
  );
}

export { formatTime };
