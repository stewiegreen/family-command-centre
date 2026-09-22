/**
 * Expanded Greenamp — same width/corner as mini player.
 * One scroll surface: now-playing page (full panel height) then queue below.
 * Does not block GreenHQ navigation.
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
type Corner = 'br' | 'bl' | 'tr' | 'tl';

const CORNER_CLASS: Record<Corner, string> = {
  br: 'bottom-3 right-3 left-auto top-auto',
  bl: 'bottom-3 left-3 right-auto top-auto',
  tr: 'top-3 right-3 left-auto bottom-auto',
  tl: 'top-3 left-3 right-auto bottom-auto',
};

function loadCorner(): Corner {
  try {
    const c = localStorage.getItem('greenhq-music-corner');
    if (c === 'br' || c === 'bl' || c === 'tr' || c === 'tl') return c;
  } catch {
    /* ignore */
  }
  return 'br';
}

function isBottomCorner(c: Corner): boolean {
  return c === 'br' || c === 'bl';
}

export function MusicPlayer() {
  const music = useMusicPlayer();
  const open = Boolean(music.expanded && music.currentTrack);
  const [visualMode, setVisualMode] = useState<VisualMode>('art');
  const [corner, setCorner] = useState<Corner>(() => loadCorner());
  const [entered, setEntered] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nowRef = useRef<HTMLDivElement | null>(null);
  const queueAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCorner(loadCorner());
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!music.expanded) setVisualMode('art');
  }, [music.expanded]);

  // Opened via queue button → jump to queue page
  useEffect(() => {
    if (!open || !entered || !music.queueOpen) return;
    const t = window.setTimeout(() => {
      queueAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 280);
    return () => window.clearTimeout(t);
  }, [open, entered, music.queueOpen]);

  // Reset scroll to now-playing when opening
  useEffect(() => {
    if (!open || !entered) return;
    if (music.queueOpen) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [open, entered, music.queueOpen, music.currentTrack?.Id]);

  if (!open || !music.currentTrack) return null;

  const track = music.currentTrack;
  const title = displayTitle(track);
  const artist =
    albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
  const albumName = track.Album || music.album?.Name || '';
  const artItem =
    music.album && music.album.ImageTags?.Primary ? music.album : track;
  const art = embyPosterUrl(artItem, 640) || embyPosterUrl(track, 640);
  const artAtmosphere =
    embyPosterUrl(artItem, 100) || embyPosterUrl(track, 100) || art;
  const artKey = artItem.Id || track.Id;
  const bottom = isBottomCorner(corner);

  const minimize = () => {
    setEntered(false);
    window.setTimeout(() => music.setExpanded(false), 200);
  };

  const scrollToQueue = () => {
    queueAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToNow = () => {
    nowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const body = (
    <div
      className={cn(
        'fixed z-[95] pointer-events-none',
        'pb-[env(safe-area-inset-bottom)]',
        CORNER_CLASS[corner],
      )}
      role="dialog"
      aria-label="Greenamp expanded"
    >
      <div
        className={cn(
          'pointer-events-auto relative',
          'w-[min(100vw-1.5rem,22rem)] sm:w-[22rem]',
          /* Shorter so queue stays below the fold */
          'h-[min(68vh,520px)]',
          'flex flex-col overflow-hidden',
          'rounded-2xl border border-white/[0.09]',
          'bg-zinc-950/95 backdrop-blur-xl',
          'shadow-2xl shadow-black/60 ring-1 ring-black/40',
          'transition-all duration-300 ease-out',
          bottom ? 'origin-bottom' : 'origin-top',
          entered
            ? 'opacity-100 scale-100 translate-y-0'
            : bottom
              ? 'opacity-0 scale-95 translate-y-3'
              : 'opacity-0 scale-95 -translate-y-3',
        )}
      >
        {/* Atmosphere */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl" aria-hidden>
          {artAtmosphere ? (
            <img
              key={artKey}
              src={artAtmosphere}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-150 blur-2xl opacity-35 saturate-150"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/85 to-zinc-950" />
        </div>

        {/* Chrome */}
        <div className="relative z-10 shrink-0 flex items-center justify-between px-2 pt-2 pb-1">
          <button
            type="button"
            onClick={minimize}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/45 hover:text-white hover:bg-white/10 text-xs font-medium"
            aria-label="Collapse to mini player"
          >
            <ChevronDown className={cn('w-4 h-4', !bottom && 'rotate-180')} />
            Mini
          </button>
          <div className="flex items-center rounded-full bg-black/35 p-0.5 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => setVisualMode('art')}
              className={cn(
                'p-1.5 rounded-full transition-colors',
                visualMode === 'art' ? 'bg-white/15 text-white' : 'text-white/40',
              )}
              aria-label="Album art"
            >
              <Image className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setVisualMode('viz')}
              className={cn(
                'p-1.5 rounded-full transition-colors',
                visualMode === 'viz'
                  ? 'bg-emerald-500/25 text-emerald-200'
                  : 'text-white/40',
              )}
              aria-label="Visualizer"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={scrollToQueue}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/45 hover:text-white hover:bg-white/10 text-xs font-medium"
          >
            <ListMusic className="w-3.5 h-3.5" />
            Queue
          </button>
        </div>

        {/* Single scroll surface — now-playing is one full “page”, queue is next */}
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Page 1: now playing — fills the scrollport */}
          <div
            ref={nowRef}
            className="min-h-full flex flex-col px-5 pt-1 pb-2 box-border"
          >
            <div className="flex-1 flex flex-col items-center justify-center min-h-0">
              <div className="w-full max-w-[13.5rem] aspect-square shrink-0">
                {visualMode === 'art' ? (
                  <div
                    key={`art-${artKey}`}
                    className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-zinc-900 shadow-lg shadow-black/40"
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

              <div className="w-full mt-4 text-center space-y-0.5 shrink-0">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug line-clamp-2">
                  {title}
                </h2>
                {artist ? (
                  <p className="text-sm text-white/60 line-clamp-1">{artist}</p>
                ) : null}
                {albumName ? (
                  <p className="text-[11px] text-white/35 line-clamp-1">{albumName}</p>
                ) : null}
              </div>

              <div className="w-full mt-3 shrink-0">
                <MusicProgress
                  position={music.position}
                  duration={music.duration}
                  onSeek={music.seek}
                />
              </div>

              <div className="flex items-center justify-center gap-2 mt-3 w-full shrink-0">
                <button
                  type="button"
                  onClick={music.toggleShuffle}
                  className={cn(
                    'p-1.5 rounded-full',
                    music.shuffle ? 'text-emerald-300' : 'text-white/30 hover:text-white/70',
                  )}
                  aria-label="Shuffle"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
                <MusicControls
                  size="md"
                  isPlaying={music.isPlaying}
                  onPrev={music.previous}
                  onToggle={music.togglePlay}
                  onNext={music.next}
                />
                <button
                  type="button"
                  onClick={music.cycleRepeat}
                  className={cn(
                    'p-1.5 rounded-full',
                    music.repeat !== 'off'
                      ? 'text-emerald-300'
                      : 'text-white/30 hover:text-white/70',
                  )}
                  aria-label="Repeat"
                >
                  {music.repeat === 'one' ? (
                    <Repeat1 className="w-3.5 h-3.5" />
                  ) : (
                    <Repeat className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 w-full max-w-[11rem] mt-2 shrink-0">
                <button
                  type="button"
                  onClick={music.toggleMute}
                  className="p-1 text-white/40 hover:text-white"
                  aria-label={music.muted ? 'Unmute' : 'Mute'}
                >
                  {music.muted || music.volume <= 0 ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
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
                    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5',
                    '[&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full',
                    '[&::-webkit-slider-thumb]:bg-white',
                  )}
                  aria-label="Volume"
                />
              </div>

              {music.error ? (
                <p className="mt-2 text-[11px] text-red-400 text-center">{music.error}</p>
              ) : null}
            </div>

            {/* Chevron cue — queue below */}
            <button
              type="button"
              onClick={scrollToQueue}
              className="shrink-0 w-full flex flex-col items-center gap-0.5 py-2 text-white/35 hover:text-emerald-300/80 transition-colors"
              aria-label="Show queue"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                Queue
              </span>
              <ChevronDown className="w-5 h-5 animate-bounce" style={{ animationDuration: '1.6s' }} />
            </button>
          </div>

          {/* Page 2: queue */}
          <div
            ref={queueAnchorRef}
            className="min-h-full flex flex-col px-3 pt-2 pb-4 box-border bg-black/20 border-t border-white/[0.06]"
          >
            <button
              type="button"
              onClick={scrollToNow}
              className="shrink-0 flex items-center justify-center gap-1 py-1.5 mb-1 text-white/35 hover:text-white/70 text-[10px] font-semibold uppercase tracking-[0.12em]"
            >
              <ChevronDown className="w-4 h-4 rotate-180" />
              Now playing
            </button>
            <div className="flex-1 min-h-0">
              <MusicQueue />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return body;
  return createPortal(body, document.body);
}
