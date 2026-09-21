import { ListMusic, X } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { albumArtistLine, displayTitle, embyPosterUrl, formatTicksDuration } from '../../lib/emby';
import { cn } from '../../lib/cn';

export function MusicQueue({ className }: { className?: string }) {
  const music = useMusicPlayer();

  if (!music.queue.length) {
    return (
      <div className={cn('text-sm text-white/50 p-4 text-center', className)}>
        Queue is empty
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div className="flex items-center gap-2 px-1 pb-2 shrink-0">
        <ListMusic className="w-4 h-4 text-emerald-400/90" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
          Up next · {music.queue.length}
        </h3>
      </div>
      <ul className="flex-1 overflow-y-auto space-y-0.5 min-h-0 pr-0.5">
        {music.queue.map((t, i) => {
          const active = i === music.queueIndex;
          const art = embyPosterUrl(t, 64);
          return (
            <li key={`${t.Id}-${i}`}>
              <div
                className={cn(
                  'group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors',
                  active ? 'bg-emerald-500/15 ring-1 ring-emerald-400/25' : 'hover:bg-white/5',
                )}
              >
                <button
                  type="button"
                  onClick={() => music.playTrackAt(i)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                >
                  <div className="w-9 h-9 rounded-md overflow-hidden bg-white/5 shrink-0 border border-white/10">
                    {art ? (
                      <img src={art} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm truncate',
                        active ? 'text-emerald-300 font-semibold' : 'text-white/90',
                      )}
                    >
                      {displayTitle(t)}
                    </p>
                    <p className="text-[11px] text-white/45 truncate">
                      {albumArtistLine(t) || t.AlbumArtist || t.Artists?.[0] || '—'}
                    </p>
                  </div>
                  <span className="text-[10px] tabular-nums text-white/35 shrink-0">
                    {formatTicksDuration(t.RunTimeTicks)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => music.removeFromQueue(i)}
                  className="p-1 rounded-md text-white/30 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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
