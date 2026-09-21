/**
 * Persistent mini music player — compact control bar for the expanded player.
 * Same MusicPlayerContext session; hidden while expanded.
 */
import { ListMusic, Volume2, VolumeX, X } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { albumArtistLine, displayTitle, embyPosterUrl } from '../../lib/emby';
import { cn } from '../../lib/cn';
import { MusicControls } from './MusicControls';
import { MusicProgress } from './MusicProgress';

export function MiniMusicPlayer() {
  const mp = useMusicPlayer();

  if (!mp.currentTrack || !mp.miniVisible || mp.expanded) return null;

  const track = mp.currentTrack;
  const title = displayTitle(track);
  const artist =
    albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
  const albumName = track.Album || mp.album?.Name || '';
  const art =
    embyPosterUrl(mp.album && mp.album.ImageTags?.Primary ? mp.album : track, 128) ||
    embyPosterUrl(track, 128);

  return (
    <div
      className={cn(
        'fixed bottom-0 inset-x-0 z-[90]',
        'pb-[env(safe-area-inset-bottom)]',
        'pointer-events-none',
      )}
      role="region"
      aria-label="Now playing"
    >
      <div
        className={cn(
          'pointer-events-auto mx-2 sm:mx-auto max-w-3xl mb-2 sm:mb-3',
          'rounded-2xl border border-white/[0.08]',
          'bg-zinc-950/92 backdrop-blur-xl',
          'shadow-2xl shadow-black/50 ring-1 ring-black/30',
          'transition-shadow duration-200 hover:shadow-emerald-950/20',
        )}
      >
        {/* Progress */}
        <div className="px-3 pt-2.5">
          <MusicProgress
            position={mp.position}
            duration={mp.duration}
            onSeek={mp.seek}
            compact
          />
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 pb-2.5 pt-1.5">
          {/* Art — opens expanded */}
          <button
            type="button"
            onClick={() => mp.setExpanded(true)}
            className={cn(
              'shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden',
              'border border-white/10 bg-white/5 shadow-md',
              'ring-1 ring-white/5 hover:ring-emerald-400/30',
              'transition-all duration-200 hover:scale-[1.03]',
            )}
            aria-label="Open player"
          >
            {art ? (
              <img src={art} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-900/50 to-zinc-800" />
            )}
          </button>

          {/* Meta */}
          <button
            type="button"
            onClick={() => mp.setExpanded(true)}
            className="min-w-0 flex-1 text-left group"
          >
            <p className="text-sm font-semibold text-white truncate leading-tight group-hover:text-emerald-100 transition-colors">
              {title}
            </p>
            <p className="text-[11px] text-white/50 truncate mt-0.5 group-hover:text-white/65 transition-colors">
              {[artist, albumName].filter(Boolean).join(' · ')}
            </p>
          </button>

          <MusicControls
            size="sm"
            isPlaying={mp.isPlaying}
            onPrev={mp.previous}
            onToggle={mp.togglePlay}
            onNext={mp.next}
            className="shrink-0"
          />

          {/* Volume — desktop */}
          <div className="hidden md:flex items-center gap-1.5 w-28 shrink-0">
            <button
              type="button"
              onClick={mp.toggleMute}
              className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={mp.muted ? 'Unmute' : 'Mute'}
            >
              {mp.muted || mp.volume <= 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mp.muted ? 0 : mp.volume}
              onChange={(e) => mp.setVolume(Number(e.target.value))}
              className={cn(
                'w-full h-1 appearance-none rounded-full bg-white/12 cursor-pointer',
                '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5',
                '[&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full',
                '[&::-webkit-slider-thumb]:bg-white',
              )}
              aria-label="Volume"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              mp.setQueueOpen(true);
              mp.setExpanded(true);
            }}
            className="p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 shrink-0 transition-colors"
            aria-label="Open queue"
            title="Queue"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={mp.stop}
            className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/10 shrink-0 transition-colors"
            aria-label="Close player"
            title="Stop and close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
