/**
 * Expanded GreenHQ music player — dedicated desktop player feel.
 * Playback stays on MusicPlayerContext’s single <audio>.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ListMusic,
  Volume2,
  VolumeX,
  X,
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

function formatRemain(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicPlayer() {
  const music = useMusicPlayer();
  const open = Boolean(music.expanded && music.currentTrack);

  // Lock body scroll while expanded
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !music.currentTrack) return null;

  const track = music.currentTrack;
  const title = displayTitle(track);
  const artist =
    albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
  const albumName = track.Album || music.album?.Name || '';
  const artItem =
    music.album && music.album.ImageTags?.Primary ? music.album : track;
  const art = embyPosterUrl(artItem, 900) || embyPosterUrl(track, 900);
  const artBlur = embyPosterUrl(artItem, 160) || art;
  const remaining = Math.max(0, (music.duration || 0) - (music.position || 0));

  const body = (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-end sm:items-center justify-center',
        'p-0 sm:p-5 md:p-8',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Music player"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[6px] transition-opacity"
        aria-label="Minimize player"
        onClick={() => music.setExpanded(false)}
      />

      {/* Shell */}
      <div
        className={cn(
          'relative z-10 w-full sm:max-w-3xl lg:max-w-5xl',
          'max-h-[min(94vh,920px)]',
          'rounded-t-[1.75rem] sm:rounded-3xl overflow-hidden',
          'border border-white/[0.08] shadow-2xl shadow-black/70',
          'flex flex-col',
          'bg-zinc-950/95',
        )}
      >
        {/* Atmosphere */}
        {artBlur ? (
          <img
            src={artBlur}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-[0.28] blur-3xl scale-150 saturate-150"
            aria-hidden
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-zinc-950/80 to-zinc-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.08),_transparent_55%)]" />

        {/* Chrome */}
        <div className="relative z-10 flex items-center gap-2 px-4 sm:px-5 py-3 shrink-0 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => music.setExpanded(false)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5',
              'text-white/55 hover:text-white hover:bg-white/10',
              'text-sm font-medium transition-colors',
            )}
          >
            <ChevronDown className="w-4 h-4" />
            <span className="hidden sm:inline">Mini player</span>
          </button>

          <p className="flex-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35 truncate px-2">
            Now playing
          </p>

          <button
            type="button"
            onClick={() => music.setQueueOpen(!music.queueOpen)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors',
              music.queueOpen
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30'
                : 'text-white/50 hover:text-white hover:bg-white/10',
            )}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">Queue</span>
            {music.queue.length > 0 ? (
              <span className="tabular-nums text-[10px] opacity-70">{music.queue.length}</span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={music.stop}
            className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Stop and close"
            title="Stop"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="relative z-10 flex-1 min-h-0 overflow-hidden">
          <div
            className={cn(
              'h-full grid gap-0',
              music.queueOpen
                ? 'lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]'
                : 'grid-cols-1',
            )}
          >
            {/* Main */}
            <div className="overflow-y-auto overscroll-contain px-5 sm:px-8 py-5 sm:py-7">
              <div className="flex flex-col items-center max-w-md mx-auto w-full">
                {/* Album art */}
                <div
                  className={cn(
                    'relative w-full max-w-[min(100%,20rem)] sm:max-w-[22rem]',
                    'aspect-square rounded-2xl overflow-hidden',
                    'border border-white/10 bg-zinc-900',
                    'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]',
                    'ring-1 ring-white/5',
                  )}
                >
                  {art ? (
                    <img
                      src={art}
                      alt=""
                      className="w-full h-full object-cover transition-opacity duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-900/40 to-zinc-800" />
                  )}
                </div>

                {/* Meta */}
                <div className="w-full mt-6 text-center space-y-1.5">
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug line-clamp-2">
                    {title}
                  </h2>
                  {artist ? (
                    <p className="text-sm sm:text-[15px] text-white/70 font-medium line-clamp-1">
                      {artist}
                    </p>
                  ) : null}
                  {albumName ? (
                    <p className="text-xs text-white/40 line-clamp-1 tracking-wide">
                      {albumName}
                    </p>
                  ) : null}
                </div>

                {/* Visualizer */}
                <div className="w-full mt-5">
                  <MusicVisualizer />
                </div>

                {/* Progress */}
                <div className="w-full mt-5 space-y-1.5">
                  <MusicProgress
                    position={music.position}
                    duration={music.duration}
                    onSeek={music.seek}
                  />
                  {remaining > 0 ? (
                    <p className="text-[10px] text-white/30 text-center tabular-nums tracking-wide">
                      −{formatRemain(remaining)} remaining
                    </p>
                  ) : null}
                </div>

                {/* Transport */}
                <MusicControls
                  size="lg"
                  isPlaying={music.isPlaying}
                  onPrev={music.previous}
                  onToggle={music.togglePlay}
                  onNext={music.next}
                  className="mt-4"
                />

                {/* Volume */}
                <div className="flex items-center gap-2.5 w-full max-w-[16rem] mt-5">
                  <button
                    type="button"
                    onClick={music.toggleMute}
                    className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
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
                      '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow',
                      '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
                    )}
                    aria-label="Volume"
                  />
                </div>

                {music.error ? (
                  <p className="mt-4 text-xs text-red-400/90 text-center px-3 leading-relaxed">
                    {music.error}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Queue pane */}
            {music.queueOpen ? (
              <div
                className={cn(
                  'border-t lg:border-t-0 lg:border-l border-white/[0.07]',
                  'bg-black/20 backdrop-blur-sm',
                  'px-4 sm:px-5 py-4',
                  'min-h-[14rem] max-h-[38vh] lg:max-h-none lg:min-h-0',
                  'overflow-hidden flex flex-col',
                )}
              >
                <MusicQueue className="h-full min-h-0" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return body;
  return createPortal(body, document.body);
}
