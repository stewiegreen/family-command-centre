import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '../../lib/cn';

export function MusicControls({
  isPlaying,
  onPrev,
  onToggle,
  onNext,
  size = 'md',
  className,
}: {
  isPlaying: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const icon = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const btn = size === 'sm' ? 'p-1.5' : 'p-2';
  const playBtn = size === 'sm' ? 'p-2' : 'p-2.5';

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <button
        type="button"
        onClick={onPrev}
        className={cn(btn, 'rounded-full text-white/80 hover:text-white hover:bg-white/10')}
        aria-label="Previous track"
      >
        <SkipBack className={cn(icon, 'fill-current')} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          playBtn,
          'rounded-full bg-white text-zinc-900 hover:bg-white/90 shadow-md mx-0.5',
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className={cn(icon, 'fill-current')} />
        ) : (
          <Play className={cn(icon, 'fill-current')} />
        )}
      </button>
      <button
        type="button"
        onClick={onNext}
        className={cn(btn, 'rounded-full text-white/80 hover:text-white hover:bg-white/10')}
        aria-label="Next track"
      >
        <SkipForward className={cn(icon, 'fill-current')} />
      </button>
    </div>
  );
}
