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
}: {
  position: number;
  duration: number;
  onSeek?: (seconds: number) => void;
  compact?: boolean;
  className?: string;
}) {
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      {!compact && (
        <span className="text-[10px] tabular-nums text-white/50 w-8 text-right shrink-0">
          {formatTime(position)}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={0.25}
        value={Math.min(position, duration || 0)}
        onChange={(e) => onSeek?.(Number(e.target.value))}
        className={cn(
          'flex-1 min-w-0 h-1 appearance-none rounded-full bg-white/15 cursor-pointer',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
          '[&::-webkit-slider-thumb]:shadow',
        )}
        style={{
          background: `linear-gradient(to right, rgb(52 211 153) ${pct}%, rgba(255,255,255,0.15) ${pct}%)`,
        }}
        aria-label="Seek"
      />
      {!compact && (
        <span className="text-[10px] tabular-nums text-white/50 w-8 shrink-0">
          {formatTime(duration)}
        </span>
      )}
    </div>
  );
}

export { formatTime };
