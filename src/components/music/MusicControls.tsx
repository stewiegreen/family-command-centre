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
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const icon = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  const btn = size === 'sm' ? 'p-1.5' : size === 'lg' ? 'p-2.5' : 'p-2';
  const playBtn =
    size === 'sm' ? 'p-2' : size === 'lg' ? 'p-3.5' : 'p-2.5';

  return (
    <div className={cn('flex items-center justify-center gap-1', className)}>
      <button
        type="button"
        onClick={onPrev}
        className={cn(
          btn,
          'rounded-full text-white/70 hover:text-white hover:bg-white/10',
          'transition-colors duration-150 active:scale-95',
        )}
        aria-label="Previous track"
      >
        <SkipBack className={cn(icon, 'fill-current')} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          playBtn,
          'rounded-full bg-white text-zinc-900 shadow-lg shadow-black/30 mx-1',
          'hover:bg-emerald-100 hover:scale-105 active:scale-95',
          'transition-all duration-150',
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className={cn(icon, 'fill-current')} />
        ) : (
          <Play className={cn(icon, 'fill-current ml-0.5')} />
        )}
      </button>
      <button
        type="button"
        onClick={onNext}
        className={cn(
          btn,
          'rounded-full text-white/70 hover:text-white hover:bg-white/10',
          'transition-colors duration-150 active:scale-95',
        )}
        aria-label="Next track"
      >
        <SkipForward className={cn(icon, 'fill-current')} />
      </button>
    </div>
  );
}
