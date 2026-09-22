import { ListMusic, X } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import {
  albumArtistLine,
  displayTitle,
  embyPosterUrl,
  formatTicksDuration,
} from '../../lib/emby';
import { cn } from '../../lib/cn';

/**
 * Queue list for Greenamp expanded sheet.
 * Parent owns scrolling — no nested overflow here.
 */
export function MusicQueue({ className, embedded: _embedded }: { className?: string; embedded?: boolean }) {
  void _embedded;
  const music = useMusicPlayer();

  if (!music.queue.length) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 py-10 px-4 text-center',
          className,
        )}
      >
        <ListMusic className="w-8 h-8 text-white/20" />
        <p className="text-sm text-white/40">Queue is empty</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-2 px-1 pb-3 shrink-0">
        <ListMusic className="w-3.5 h-3.5 text-emerald-400/80" />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
          Up next
        </h3>
        <span className="text-[11px] tabular-nums text-white/30 ml-auto">
          {music.queue.length}
        </span>
      </div>
      <ul className="space-y-0.5">
        {music.queue.map((t, i) => {
          const active = i === music.queueIndex;
          const art = embyPosterUrl(t, 80);
          const artist =
            albumArtistLine(t) || t.AlbumArtist || t.Artists?.[0] || '';
          return (
            <li key={`${t.Id}-${i}`}>
              <div
                className={cn(
                  'group flex items-center gap-2.5 rounded-xl pl-1.5 pr-1 py-1.5 transition-colors duration-150',
                  active
                    ? 'bg-emerald-500/12 ring-1 ring-emerald-400/30'
                    : 'hover:bg-white/[0.06]',
                )}
              >
                <button
                  type="button"
                  onClick={() => music.playTrackAt(i)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  title={active ? 'Now playing' : 'Play this track'}
                >
                  <div
                    className={cn(
                      'relative w-10 h-10 rounded-lg overflow-hidden shrink-0',
                      'bg-white/5 border border-white/10',
                      active && 'ring-1 ring-emerald-400/40',
                    )}
                  >
                    {art ? (
                      <img src={art} alt="" className="w-full h-full object-cover" />
                    ) : null}
                    {active && music.isPlaying ? (
                      <span className="absolute inset-0 flex items-end justify-center gap-0.5 pb-1.5 bg-black/35">
                        <span className="w-0.5 h-2 bg-emerald-300 animate-pulse rounded-full" />
                        <span className="w-0.5 h-3 bg-emerald-300 animate-pulse rounded-full [animation-delay:120ms]" />
                        <span className="w-0.5 h-1.5 bg-emerald-300 animate-pulse rounded-full [animation-delay:240ms]" />
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-[13px] truncate leading-snug',
                        active ? 'text-emerald-200 font-semibold' : 'text-white/90',
                      )}
                    >
                      {displayTitle(t)}
                    </p>
                    <p className="text-[11px] text-white/40 truncate mt-0.5">
                      {artist || '—'}
                      {t.Album ? ` · ${t.Album}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] tabular-nums text-white/30 shrink-0 pr-0.5">
                    {formatTicksDuration(t.RunTimeTicks)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => music.removeFromQueue(i)}
                  className={cn(
                    'p-1.5 rounded-lg shrink-0 transition-opacity duration-150',
                    'text-white/25 hover:text-white hover:bg-white/10',
                    'opacity-0 group-hover:opacity-100 focus:opacity-100',
                    active && 'opacity-60',
                  )}
                  aria-label="Remove from queue"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
