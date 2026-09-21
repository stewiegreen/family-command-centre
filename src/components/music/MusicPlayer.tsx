/**
 * Expanded Greenamp player — art/visualizer-first, dynamic album atmosphere.
 * Playback stays on MusicPlayerContext’s single <audio>.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ChevronDown,
  Image,
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

type VisualMode = 'art' | 'viz';

function formatRemain(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicPlayer() {
  const music = useMusicPlayer();
  const open = Boolean(music.expanded && music.currentTrack);
  /** Remembered while the expanded player stays open. */
  const [visualMode, setVisualMode] = useState<VisualMode>('art');

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset mode when fully closed so next open starts on art (session feel)
  useEffect(() => {
    if (!music.expanded) setVisualMode('art');
  }, [music.expanded]);

  if (!open || !music.currentTrack) return null;

  const track = music.currentTrack;
  const title = displayTitle(track);
  const artist =
    albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
  const albumName = track.Album || music.album?.Name || '';
  const artItem =
    music.album && music.album.ImageTags?.Primary ? music.album : track;
  const art = embyPosterUrl(artItem, 1000) || embyPosterUrl(track, 1000);
  // Low-res for blur layer (cheaper + softer)
  const artAtmosphere = embyPosterUrl(artItem, 120) || embyPosterUrl(track, 120) || art;
  const remaining = Math.max(0, (music.duration || 0) - (music.position || 0));
  const artKey = artItem.Id || track.Id;

  const body = (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-end sm:items-center justify-center',
        'p-0 sm:p-4 md:p-6 lg:p-8',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Greenamp music player"
    >
      {/* Dim page */}
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Minimize player"
        onClick={() => music.setExpanded(false)}
      />

      {/* Player shell */}
      <div
        className={cn(
          'relative z-10 w-full sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl',
          'max-h-[min(96vh,940px)]',
          'rounded-t-[1.75rem] sm:rounded-3xl overflow-hidden',
          'border border-white/[0.07] shadow-2xl shadow-black/80',
          'flex flex-col bg-zinc-950',
        )}
      >
        {/* ── Dynamic album atmosphere ─────────────────────────── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {artAtmosphere ? (
            <img
              key={artKey}
              src={artAtmosphere}
              alt=""
              className={cn(
                'absolute inset-0 w-full h-full object-cover',
                'scale-[1.45] blur-[48px] saturate-150',
                'opacity-[0.34] transition-opacity duration-700',
              )}
            />
          ) : null}
          {/* Darken + readability layers */}
          <div className="absolute inset-0 bg-zinc-950/55" />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-zinc-950/70 to-zinc-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,_rgba(16,185,129,0.1),_transparent_50%)]" />
        </div>

        {/* ── Chrome ───────────────────────────────────────────── */}
        <div className="relative z-10 flex items-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 shrink-0 border-b border-white/[0.06]">
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
            <span className="hidden sm:inline">Mini</span>
          </button>

          <p className="flex-1 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-white/30 truncate">
            Greenamp
          </p>

          {/* Art ↔ Viz toggle */}
          <div className="flex items-center rounded-full bg-black/35 p-0.5 ring-1 ring-white/10">
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
              title="Album art"
            >
              <Image className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Art</span>
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
              title="Visualizer"
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Viz</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => music.setQueueOpen(!music.queueOpen)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors',
              music.queueOpen
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30'
                : 'text-white/50 hover:text-white hover:bg-white/10',
            )}
          >
            <ListMusic className="w-3.5 h-3.5" />
            {music.queue.length > 0 ? (
              <span className="tabular-nums text-[10px] opacity-70">{music.queue.length}</span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={music.stop}
            className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Stop and close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="relative z-10 flex-1 min-h-0 overflow-hidden">
          <div
            className={cn(
              'h-full grid gap-0',
              music.queueOpen
                ? 'lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]'
                : 'grid-cols-1',
            )}
          >
            <div className="overflow-y-auto overscroll-contain px-5 sm:px-8 py-5 sm:py-6">
              <div className="flex flex-col items-center max-w-lg mx-auto w-full">
                {/* Dominant visual: art OR visualizer */}
                <div
                  className={cn(
                    'relative w-full max-w-[min(100%,22rem)] sm:max-w-[24rem] md:max-w-[26rem]',
                    'aspect-square',
                  )}
                >
                  {visualMode === 'art' ? (
                    <div
                      key={`art-${artKey}`}
                      className={cn(
                        'w-full h-full rounded-2xl overflow-hidden',
                        'border border-white/10 bg-zinc-900',
                        'shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]',
                        'ring-1 ring-white/5',
                      )}
                    >
                      {art ? (
                        <img
                          src={art}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-emerald-900/40 to-zinc-800" />
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-full">
                      <MusicVisualizer variant="hero" className="h-full" />
                    </div>
                  )}
                </div>

                {/* Meta under visual */}
                <div className="w-full mt-6 text-center space-y-1.5">
                  <h2 className="text-xl sm:text-2xl md:text-[1.65rem] font-bold text-white tracking-tight leading-snug line-clamp-2">
                    {title}
                  </h2>
                  {artist ? (
                    <p className="text-sm sm:text-[15px] text-white/75 font-medium line-clamp-1">
                      {artist}
                    </p>
                  ) : null}
                  {albumName ? (
                    <p className="text-xs text-white/40 line-clamp-1 tracking-wide">
                      {albumName}
                    </p>
                  ) : null}
                </div>

                {/* Transport */}
                <div className="w-full mt-6 space-y-3">
                  <MusicProgress
                    position={music.position}
                    duration={music.duration}
                    onSeek={music.seek}
                  />
                  {remaining > 0 ? (
                    <p className="text-[10px] text-white/30 text-center tabular-nums">
                      −{formatRemain(remaining)} remaining
                    </p>
                  ) : null}
                </div>

                <MusicControls
                  size="lg"
                  isPlaying={music.isPlaying}
                  onPrev={music.previous}
                  onToggle={music.togglePlay}
                  onNext={music.next}
                  className="mt-3"
                />

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
                    )}
                    aria-label="Volume"
                  />
                </div>

                {music.error ? (
                  <p className="mt-4 text-xs text-red-400/90 text-center px-3">
                    {music.error}
                  </p>
                ) : null}
              </div>
            </div>

            {music.queueOpen ? (
              <div
                className={cn(
                  'border-t lg:border-t-0 lg:border-l border-white/[0.07]',
                  'bg-black/25 backdrop-blur-md',
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
