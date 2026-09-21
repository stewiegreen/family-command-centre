/**
 * Expanded GreenHQ music player — overlay, art-forward, queue + light visualizer.
 * Playback stays on MusicPlayerContext’s single <audio>.
 */
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

export function MusicPlayer() {
  const music = useMusicPlayer();

  if (!music.expanded || !music.currentTrack) return null;

  const track = music.currentTrack;
  const title = displayTitle(track);
  const artist =
    albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
  const albumName = track.Album || music.album?.Name || '';
  const artItem =
    music.album && music.album.ImageTags?.Primary ? music.album : track;
  const art = embyPosterUrl(artItem, 800) || embyPosterUrl(track, 800);
  const artBlur = embyPosterUrl(artItem, 200) || art;

  const remaining = Math.max(0, (music.duration || 0) - (music.position || 0));

  const body = (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Music player"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Minimize player"
        onClick={() => music.setExpanded(false)}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative z-10 w-full sm:max-w-4xl max-h-[min(92vh,900px)]',
          'rounded-t-3xl sm:rounded-3xl overflow-hidden',
          'border border-white/10 shadow-2xl shadow-black/60',
          'flex flex-col bg-zinc-950',
        )}
      >
        {/* Atmosphere: blurred art */}
        {artBlur ? (
          <img
            src={artBlur}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40 blur-3xl scale-125"
            aria-hidden
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/85 to-zinc-950" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-4 sm:px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={() => music.setExpanded(false)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium"
          >
            <ChevronDown className="w-5 h-5" />
            Mini player
          </button>
          <button
            type="button"
            onClick={() => music.setQueueOpen(!music.queueOpen)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors',
              music.queueOpen
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-white/55 hover:text-white hover:bg-white/10',
            )}
          >
            <ListMusic className="w-4 h-4" />
            Queue
          </button>
          <button
            type="button"
            onClick={music.stop}
            className="p-1.5 rounded-full text-white/45 hover:text-white hover:bg-white/10"
            aria-label="Stop and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto">
          <div
            className={cn(
              'grid gap-6 sm:gap-8 px-5 sm:px-8 pb-8',
              music.queueOpen ? 'lg:grid-cols-[1fr_minmax(240px,280px)]' : 'grid-cols-1',
            )}
          >
            {/* Main column */}
            <div className="flex flex-col items-center max-w-md mx-auto w-full">
              {/* Large art — landscape-ish frame on desktop via max width */}
              <div className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50 bg-zinc-900">
                {art ? (
                  <img src={art} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-900/50 to-zinc-800" />
                )}
              </div>

              <div className="w-full mt-5 text-center space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight line-clamp-2">
                  {title}
                </h2>
                {artist ? (
                  <p className="text-sm sm:text-base text-white/70 line-clamp-1">{artist}</p>
                ) : null}
                {albumName ? (
                  <p className="text-xs text-white/45 line-clamp-1">{albumName}</p>
                ) : null}
              </div>

              <div className="w-full mt-4">
                <MusicVisualizer />
              </div>

              <div className="w-full mt-4 space-y-2">
                <MusicProgress
                  position={music.position}
                  duration={music.duration}
                  onSeek={music.seek}
                />
                <p className="text-[10px] text-white/35 text-center tabular-nums">
                  {remaining > 0 ? `−${formatRemain(remaining)} remaining` : null}
                </p>
              </div>

              <MusicControls
                size="md"
                isPlaying={music.isPlaying}
                onPrev={music.previous}
                onToggle={music.togglePlay}
                onNext={music.next}
                className="mt-3"
              />

              {/* Volume */}
              <div className="flex items-center gap-2 w-full max-w-xs mt-4">
                <button
                  type="button"
                  onClick={music.toggleMute}
                  className="p-1.5 text-white/55 hover:text-white"
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
                  className="flex-1 h-1 appearance-none rounded-full bg-white/15 cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white"
                  aria-label="Volume"
                />
              </div>

              {music.error ? (
                <p className="mt-3 text-xs text-red-400 text-center px-2">{music.error}</p>
              ) : null}
            </div>

            {/* Queue column */}
            {music.queueOpen ? (
              <div className="border-t lg:border-t-0 lg:border-l border-white/10 pt-4 lg:pt-0 lg:pl-5 min-h-[12rem] max-h-[40vh] lg:max-h-none">
                <MusicQueue className="h-full max-h-[40vh] lg:max-h-[min(70vh,640px)]" />
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

function formatRemain(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
