/**
 * Album page — lives inside GreenHQ Media (nav/header stay visible).
 *
 * Layout (desktop): sticky art + controls left, track list right (Spotify-like).
 * Mobile: art/meta on top, tracks below.
 * Color: GreenHQ surfaces + restrained art wash — not a full-screen black takeover.
 * Audio still owned by MusicPlayerContext.
 */
import { useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import {
  albumArtistLine,
  displayTitle,
  embyPosterUrl,
  formatTicksDuration,
  isAudioItem,
  type EmbyItem,
} from '../lib/emby';
import { useMusicPlayer } from '../context/MusicPlayerContext';
import { MusicProgress } from './music/MusicProgress';
import { cn } from '../lib/cn';

type Props = {
  album: EmbyItem;
  tracks: EmbyItem[];
  userId: string;
  startIndex?: number;
  autoplay?: boolean;
  onClose: () => void;
};

function trackLabel(t: EmbyItem, i: number): string {
  return String(t.IndexNumber ?? i + 1);
}

export function AlbumPlayer({
  album,
  tracks: rawTracks,
  userId,
  startIndex = 0,
  autoplay = false,
  onClose,
}: Props) {
  const music = useMusicPlayer();
  const tracks = useMemo(() => rawTracks.filter(isAudioItem), [rawTracks]);

  const art = embyPosterUrl(album, 640) || embyPosterUrl(album, 400);
  const artBlur = embyPosterUrl(album, 80) || art;
  const albumArtist = albumArtistLine(album);
  const year = album.ProductionYear;

  useEffect(() => {
    if (!tracks.length || !userId) return;
    const idx = Math.min(Math.max(0, startIndex), tracks.length - 1);
    const sameAlbum =
      music.album?.Id === album.Id &&
      music.queue.length === tracks.length &&
      tracks[0] &&
      music.queue[0]?.Id === tracks[0].Id;

    if (sameAlbum) {
      if (autoplay && idx !== music.queueIndex) music.playTrackAt(idx);
      return;
    }

    music.playTracks({
      tracks,
      album,
      startIndex: idx,
      autoplay: autoplay !== false,
      embyUserId: userId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per album open
  }, [album.Id, userId]);

  const activeId = music.currentTrack?.Id;
  const playingHere =
    music.isPlaying && Boolean(activeId && tracks.some((t) => t.Id === activeId));

  const nowTrack =
    (activeId && tracks.find((t) => t.Id === activeId)) ||
    tracks[Math.min(startIndex, Math.max(0, tracks.length - 1))] ||
    null;
  const nowTitle = nowTrack ? displayTitle(nowTrack) : displayTitle(album);
  const nowArtist =
    (nowTrack &&
      (albumArtistLine(nowTrack) || nowTrack.AlbumArtist || nowTrack.Artists?.[0])) ||
    albumArtist ||
    '';

  const playFrom = (i: number) => {
    if (!tracks.length || !userId) return;
    if (music.album?.Id !== album.Id || music.queue.length !== tracks.length) {
      music.playTracks({
        tracks,
        album,
        startIndex: i,
        autoplay: true,
        embyUserId: userId,
      });
    } else {
      music.playTrackAt(i);
    }
  };

  const totalLabel = useMemo(() => {
    const ticks = tracks.reduce((s, t) => s + (t.RunTimeTicks || 0), 0);
    if (!ticks) return `${tracks.length} tracks`;
    return `${tracks.length} tracks · ${formatTicksDuration(ticks)}`;
  }, [tracks]);

  return (
    <div className="relative -mx-1 sm:mx-0 rounded-2xl overflow-hidden border border-border bg-surface-1 shadow-lg">
      {/* Soft art wash — contained, not full viewport */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {artBlur ? (
          <img
            src={artBlur}
            alt=""
            className="absolute -top-8 left-0 right-0 h-72 w-full object-cover scale-125 blur-2xl opacity-30 saturate-150"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-surface-1/40 via-surface-1/90 to-surface-1" />
      </div>

      {/* Header — back stays in Media */}
      <div className="relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border/60">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold text-fg-secondary hover:text-fg hover:bg-nav-hover transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted truncate">
            Album
          </p>
          <p className="text-sm font-semibold text-fg truncate">{displayTitle(album)}</p>
        </div>
        {music.loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted shrink-0" />
        ) : null}
      </div>

      {/* Body: stacked mobile, split desktop */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-start gap-0 lg:gap-6 p-4 sm:p-5 lg:p-6">
        {/* Left: art + now playing + transport */}
        <div className="w-full lg:w-[min(100%,18rem)] xl:w-80 shrink-0 flex flex-col items-center lg:items-stretch lg:sticky lg:top-2">
          <div
            className={cn(
              'w-full max-w-[14rem] sm:max-w-[16rem] lg:max-w-none mx-auto',
              'aspect-square rounded-xl overflow-hidden',
              'bg-surface-2 border border-border',
              'shadow-md shadow-black/20',
            )}
          >
            {art ? (
              <img src={art} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-900/30 to-surface-2" />
            )}
          </div>

          <div className="w-full mt-4 text-center lg:text-left space-y-1">
            <h1 className="text-lg sm:text-xl font-bold text-fg tracking-tight leading-snug line-clamp-2">
              {displayTitle(album)}
            </h1>
            {albumArtist ? (
              <p className="text-sm text-fg-secondary line-clamp-1">{albumArtist}</p>
            ) : null}
            <p className="text-xs text-muted">
              {[year, totalLabel].filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* Now-playing strip */}
          <div className="w-full mt-4 rounded-xl bg-surface-2/80 border border-border px-3 py-3 space-y-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {playingHere ? 'Now playing' : 'Selected'}
              </p>
              <p className="text-sm font-semibold text-fg truncate">{nowTitle}</p>
              {nowArtist ? (
                <p className="text-xs text-fg-secondary truncate">{nowArtist}</p>
              ) : null}
            </div>
            <MusicProgress
              position={music.position}
              duration={music.duration}
              onSeek={music.seek}
              tone="onSurface"
            />
            <div className="flex items-center justify-center gap-1 pt-0.5">
              <button
                type="button"
                onClick={music.toggleShuffle}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  music.shuffle
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted hover:text-fg',
                )}
                aria-label="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={music.previous}
                className="p-2 rounded-full text-fg-secondary hover:text-fg hover:bg-nav-hover"
                aria-label="Previous"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={music.togglePlay}
                className="mx-1 p-3 rounded-full bg-fg text-surface-1 hover:opacity-90 shadow-md"
                aria-label={music.isPlaying ? 'Pause' : 'Play'}
              >
                {music.isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={music.next}
                className="p-2 rounded-full text-fg-secondary hover:text-fg hover:bg-nav-hover"
                aria-label="Next"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={music.cycleRepeat}
                className={cn(
                  'p-2 rounded-full transition-colors',
                  music.repeat !== 'off'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted hover:text-fg',
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
            {music.error ? (
              <p className="text-[11px] text-red-500 text-center">{music.error}</p>
            ) : null}
          </div>
        </div>

        {/* Right: track list */}
        <div className="flex-1 min-w-0 mt-5 lg:mt-0">
          <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Tracks
            </h2>
            <button
              type="button"
              onClick={() => playFrom(0)}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-ink px-3 py-1.5 text-xs font-bold hover:bg-accent-hover"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Play album
            </button>
          </div>
          <ul className="rounded-xl border border-border bg-surface-2/50 overflow-hidden divide-y divide-border/70">
            {tracks.map((t, i) => {
              const isActive = t.Id === activeId;
              return (
                <li key={t.Id || i}>
                  <button
                    type="button"
                    onClick={() => playFrom(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      isActive ? 'bg-emerald-500/10' : 'hover:bg-nav-hover',
                    )}
                  >
                    <span
                      className={cn(
                        'w-6 text-center text-xs tabular-nums shrink-0',
                        isActive
                          ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'text-muted',
                      )}
                    >
                      {isActive && playingHere ? (
                        <span className="inline-flex gap-0.5 justify-center items-end h-3">
                          <span className="w-0.5 h-2 bg-emerald-500 animate-pulse rounded-full" />
                          <span className="w-0.5 h-3 bg-emerald-500 animate-pulse rounded-full [animation-delay:100ms]" />
                          <span className="w-0.5 h-1.5 bg-emerald-500 animate-pulse rounded-full [animation-delay:200ms]" />
                        </span>
                      ) : (
                        trackLabel(t, i)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm truncate',
                          isActive ? 'text-fg font-semibold' : 'text-fg',
                        )}
                      >
                        {displayTitle(t)}
                      </span>
                      {albumArtistLine(t) && albumArtistLine(t) !== albumArtist ? (
                        <span className="block text-[11px] text-muted truncate">
                          {albumArtistLine(t)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[11px] text-muted tabular-nums shrink-0">
                      {formatTicksDuration(t.RunTimeTicks)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
