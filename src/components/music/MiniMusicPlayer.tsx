/**
 * Persistent mini music player — album art first, compact controls.
 * Sits above the nav while browsing GreenHQ. Step 1: chrome + context only.
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
    albumArtistLine(track) ||
    track.AlbumArtist ||
    track.Artists?.[0] ||
    '';
  const albumName = track.Album || mp.album?.Name || '';
  const art =
    embyPosterUrl(mp.album && mp.album.ImageTags?.Primary ? mp.album : track, 120) ||
    embyPosterUrl(track, 120);

  return (
    <div
      className={cn(
        'fixed bottom-0 inset-x-0 z-[90]',
        // Sit above mobile tab bars; leave a little safe area
        'pb-[env(safe-area-inset-bottom)]',
        'pointer-events-none',
      )}
      role="region"
      aria-label="Now playing"
    >
      <div
        className={cn(
          'pointer-events-auto mx-auto max-w-3xl',
          'mb-2 sm:mb-3 mx-2 sm:mx-auto',
          'rounded-2xl border border-white/10',
          'bg-zinc-950/90 backdrop-blur-xl shadow-2xl shadow-black/40',
          'ring-1 ring-black/20',
        )}
      >
        {/* Progress thin line on top edge */}
        <div className="px-3 pt-2">
          <MusicProgress
            position={mp.position}
            duration={mp.duration}
            onSeek={mp.seek}
            compact
          />
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 pb-2.5 pt-1.5">
          {/* Art */}
          <button
            type="button"
            onClick={() => mp.setExpanded(true)}
            className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden border border-white/10 bg-white/5 shadow"
            aria-label="Open player"
          >
            {art ? (
              <img src={art} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-900/40 to-zinc-800" />
            )}
          </button>

          {/* Meta */}
          <button
            type="button"
            onClick={() => mp.setExpanded(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-sm font-semibold text-white truncate leading-tight">{title}</p>
            <p className="text-[11px] text-white/55 truncate mt-0.5">
              {[artist, albumName].filter(Boolean).join(' · ')}
            </p>
          </button>

          {/* Controls */}
          <MusicControls
            size="sm"
            isPlaying={mp.isPlaying}
            onPrev={mp.previous}
            onToggle={mp.togglePlay}
            onNext={mp.next}
            className="shrink-0"
          />

          {/* Volume — desktop */}
          <div className="hidden sm:flex items-center gap-1.5 w-24 shrink-0">
            <button
              type="button"
              onClick={mp.toggleMute}
              className="p-1 rounded-md text-white/60 hover:text-white"
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
              className="w-full h-1 appearance-none rounded-full bg-white/15 cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5
                [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white"
              aria-label="Volume"
            />
          </div>

          {/* Queue stub (Step 4) */}
          <button
            type="button"
            onClick={() => { mp.setQueueOpen(true); mp.setExpanded(true); }}
            className="p-1.5 rounded-lg text-white/55 hover:text-white hover:bg-white/10 shrink-0"
            aria-label="Queue"
            title="Queue (coming next)"
          >
            <ListMusic className="w-4 h-4" />
          </button>

          {/* Close session */}
          <button
            type="button"
            onClick={mp.stop}
            className="p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 shrink-0"
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
