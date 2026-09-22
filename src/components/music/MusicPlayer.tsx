/**
 * Expanded Greenamp — slides up from the mini player as a sheet.
 * Top: now playing (art / viz, progress, controls).
 * Scroll down: queue. Playback stays on MusicPlayerContext.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ChevronDown,
  Image,
  ListMusic,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import {
  albumArtistLine,
  displayTitle,
  embyPosterUrl,
} from '../../lib/emby';
import { cn } from '../../lib/cn';
import { MusicControls } from './MusicControls';
import { MusicProgress } from './MusicProgress';
import { MusicQueue } from './MusicQueue';
import { MusicVisualizer } from './MusicVisualizer';

type VisualMode = 'art' | 'viz';

export function MusicPlayer() {
  const music = useMusicPlayer();
  const open = Boolean(music.expanded && music.currentTrack);
  const [visualMode, setVisualMode] = useState<VisualMode>('art');
  const [entered, setEntered] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const queueAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Next frame → CSS transition in
    const id = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!music.expanded) setVisualMode('art');
  }, [music.expanded]);

  // If opened via queue button, scroll queue into view once sheet is up
  useEffect(() => {
    if (!open || !entered || !music.queueOpen) return;
    const t = window.setTimeout(() => {
      queueAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 280);
    return () => window.clearTimeout(t);
  }, [open, entered, music.queueOpen]);

  if (!open || !music.currentTrack) return null;

  const track = music.currentTrack;
  const title = displayTitle(track);
  const artist =
    albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
  const albumName = track.Album || music.album?.Name || '';
  const artItem =
    music.album && music.album.ImageTags?.Primary ? music.album : track;
  const art = embyPosterUrl(artItem, 900) || embyPosterUrl(track, 900);
  const artAtmosphere =
    embyPosterUrl(artItem, 120) || embyPosterUrl(track, 120) || art;
  const artKey = artItem.Id || track.Id;

  const minimize = () => {
    setEntered(false);
    // Let slide-down finish before unmounting expanded state
    window.setTimeout(() => music.setExpanded(false), 220);
  };

  const body = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Greenamp music player"
    >
      {/* Scrim */}
      <button
        type="button"
        className={cn(
          'absolute inset-0 bg-black/55 transition-opacity duration-200',
          entered ? 'opacity-100' : 'opacity-0',
        )}
        aria-label="Minimize player"
        onClick={minimize}
      />

      {/* Sheet */}
      <div
        className={cn(
          'relative z-10 w-full sm:max-w-md md:max-w-lg',
          'max-h-[min(94vh,860px)]',
          'rounded-t-[1.75rem] overflow-hidden',
          'border border-white/[0.08] border-b-0',
          'shadow-[0_-12px_48px_rgba(0,0,0,0.55)]',
          'flex flex-col',
          'bg-zinc-950',
          'transition-transform duration-300 ease-out',
          entered ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {/* Atmosphere */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {artAtmosphere ? (
            <img
              key={artKey}
              src={artAtmosphere}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl opacity-[0.38] saturate-150"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-zinc-950/75 to-zinc-950" />
        </div>

        {/* Grab + chrome */}
        <div className="relative z-10 shrink-0 pt-2.5 pb-1">
          <button
            type="button"
            onClick={minimize}
            className="mx-auto block w-full flex flex-col items-center gap-1 py-1 text-white/40 hover:text-white/70"
            aria-label="Minimize"
          >
            <span className="w-10 h-1 rounded-full bg-white/25" />
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Scroll: now playing → queue */}
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain"
        >
          {/* —— Now playing —— */}
          <div className="px-6 sm:px-8 pb-6 flex flex-col items-center">
            {/* Art / Viz toggle */}
            <div className="self-end mb-3 flex items-center rounded-full bg-black/30 p-0.5 ring-1 ring-white/10">
              <button
                type="button"
                onClick={() => setVisualMode('art')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors',
                  visualMode === 'art'
                    ? 'bg-white/15 text-white'
                    : 'text-white/45 hover:text-white/80',
                )}
                aria-pressed={visualMode === 'art'}
              >
                <Image className="w-3.5 h-3.5" />
                Art
              </button>
              <button
                type="button"
                onClick={() => setVisualMode('viz')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors',
                  visualMode === 'viz'
                    ? 'bg-emerald-500/25 text-emerald-200'
                    : 'text-white/45 hover:text-white/80',
                )}
                aria-pressed={visualMode === 'viz'}
              >
                <Activity className="w-3.5 h-3.5" />
                Viz
              </button>
            </div>

            <div className="w-full max-w-[min(100%,18.5rem)] aspect-square">
              {visualMode === 'art' ? (
                <div
                  key={`art-${artKey}`}
                  className={cn(
                    'w-full h-full rounded-2xl overflow-hidden',
                    'border border-white/10 bg-zinc-900',
                    'shadow-[0_20px_60px_-12px_rgba(0,0,0,0.75)]',
                  )}
                >
                  {art ? (
                    <img src={art} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-900/40 to-zinc-800" />
                  )}
                </div>
              ) : (
                <MusicVisualizer variant="hero" className="h-full" />
              )}
            </div>

            <div className="w-full mt-7 text-center space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug line-clamp-2">
                {title}
              </h2>
              {artist ? (
                <p className="text-sm text-white/65 font-medium line-clamp-1">{artist}</p>
              ) : null}
              {albumName ? (
                <p className="text-xs text-white/40 line-clamp-1">{albumName}</p>
              ) : null}
            </div>

            <div className="w-full mt-6">
              <MusicProgress
                position={music.position}
                duration={music.duration}
                onSeek={music.seek}
              />
            </div>

            <div className="flex items-center justify-center gap-3 mt-5 w-full">
              <button
                type="button"
                onClick={music.toggleShuffle}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  music.shuffle
                    ? 'text-emerald-300'
                    : 'text-white/35 hover:text-white/80',
                )}
                aria-label="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <MusicControls
                size="lg"
                isPlaying={music.isPlaying}
                onPrev={music.previous}
                onToggle={music.togglePlay}
                onNext={music.next}
              />
              <button
                type="button"
                onClick={music.cycleRepeat}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  music.repeat !== 'off'
                    ? 'text-emerald-300'
                    : 'text-white/35 hover:text-white/80',
                )}
                aria-label="Repeat"
              >
                {music.repeat === 'one' ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2.5 w-full max-w-[14rem] mt-5">
              <button
                type="button"
                onClick={music.toggleMute}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                aria-label={music.muted ? 'Unmute' : 'Mute'}
              >
                {music.muted || music.volume <= 0 ? (
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
                value={music.muted ? 0 : music.volume}
                onChange={(e) => music.setVolume(Number(e.target.value))}
                className={cn(
                  'flex-1 h-1 appearance-none rounded-full bg-white/12 cursor-pointer',
                  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3',
                  '[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full',
                  '[&::-webkit-slider-thumb]:bg-white',
                )}
                aria-label="Volume"
              />
            </div>

            {music.error ? (
              <p className="mt-3 text-xs text-red-400/90 text-center">{music.error}</p>
            ) : null}

            {/* Hint to scroll */}
            <button
              type="button"
              onClick={() =>
                queueAnchorRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
              className="mt-8 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35 hover:text-white/60"
            >
              <ListMusic className="w-3.5 h-3.5" />
              Queue · scroll
            </button>
          </div>

          {/* —— Queue (revealed on scroll) —— */}
          <div
            ref={queueAnchorRef}
            className="px-4 sm:px-6 pb-10 pt-2 border-t border-white/[0.06] bg-black/20 min-h-[40vh]"
          >
            <MusicQueue />
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return body;
  return createPortal(body, document.body);
}
