/**
 * Album / now-playing sheet — large-art player (Spotify-style) + track list.
 * Audio is owned by MusicPlayerContext; closing this sheet does not stop playback.
 */
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ListMusic,
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
  const n = t.IndexNumber ?? i + 1;
  return String(n);
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

  const art = embyPosterUrl(album, 900) || embyPosterUrl(album, 600);
  const artBlur = embyPosterUrl(album, 120) || art;
  const albumArtist = albumArtistLine(album);

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
    (nowTrack && (albumArtistLine(nowTrack) || nowTrack.AlbumArtist || nowTrack.Artists?.[0])) ||
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

  const body = (
    <div className="fixed inset-0 z-[80] text-white flex flex-col overflow-hidden">
      {/* Atmosphere from album art */}
      {artBlur ? (
        <img
          src={artBlur}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-40 saturate-150"
          aria-hidden
        />
      ) : null}
      <div className="absolute inset-0 bg-zinc-950/80" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-zinc-950/70 to-zinc-950" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center gap-3 px-3 sm:px-5 py-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40 truncate">
            Playing from album
          </p>
          <p className="text-sm font-semibold text-white/90 truncate">{displayTitle(album)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            music.setQueueOpen(true);
            music.setExpanded(true);
          }}
          className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10"
          aria-label="Open Greenamp"
          title="Open Greenamp"
        >
          <ListMusic className="w-5 h-5" />
        </button>
        {music.loading ? <Loader2 className="w-4 h-4 animate-spin text-white/50" /> : null}
      </div>

      {/* Scrollable content */}
      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-5 sm:px-8 pt-2 pb-10 space-y-6">
          {/* Hero art */}
          <div
            className={cn(
              'mx-auto w-full max-w-[min(100%,20rem)] sm:max-w-[22rem]',
              'aspect-square rounded-2xl overflow-hidden',
              'shadow-[0_24px_80px_-16px_rgba(0,0,0,0.85)]',
              'ring-1 ring-white/10 bg-zinc-900',
            )}
          >
            {art ? (
              <img src={art} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-900/40 to-zinc-800" />
            )}
          </div>

          {/* Now playing meta */}
          <div className="text-left sm:text-center space-y-1 px-1">
            <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight leading-tight line-clamp-2">
              {nowTitle}
            </h1>
            {nowArtist ? (
              <p className="text-base text-white/60 font-medium line-clamp-1">{nowArtist}</p>
            ) : null}
          </div>

          {/* Progress */}
          <div className="px-0.5">
            <MusicProgress
              position={music.position}
              duration={music.duration}
              onSeek={music.seek}
            />
          </div>

          {/* Transport — large play like reference */}
          <div className="flex items-center justify-center gap-5 sm:gap-6">
            <button
              type="button"
              onClick={music.toggleShuffle}
              className={cn(
                'p-2 rounded-full transition-colors',
                music.shuffle ? 'text-emerald-300' : 'text-white/35 hover:text-white/80',
              )}
              aria-label="Shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => music.previous()}
              className="p-2 rounded-full text-white/85 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Previous"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!tracks.length) return;
                if (!music.currentTrack || music.album?.Id !== album.Id) {
                  music.playTracks({
                    tracks,
                    album,
                    startIndex: 0,
                    autoplay: true,
                    embyUserId: userId,
                  });
                } else {
                  music.togglePlay();
                }
              }}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center',
                'bg-white text-zinc-900 shadow-lg shadow-black/40',
                'hover:scale-105 active:scale-95 transition-transform',
              )}
              aria-label={playingHere ? 'Pause' : 'Play'}
            >
              {playingHere ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => music.next()}
              className="p-2 rounded-full text-white/85 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Next"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>
            <button
              type="button"
              onClick={music.cycleRepeat}
              className={cn(
                'p-2 rounded-full transition-colors',
                music.repeat !== 'off' ? 'text-emerald-300' : 'text-white/35 hover:text-white/80',
              )}
              aria-label="Repeat"
            >
              {music.repeat === 'one' ? (
                <Repeat1 className="w-5 h-5" />
              ) : (
                <Repeat className="w-5 h-5" />
              )}
            </button>
          </div>

          {music.error ? (
            <p className="text-xs text-red-400 text-center px-2">{music.error}</p>
          ) : null}

          {/* Track list */}
          <div className="pt-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35 mb-2 px-1">
              {tracks.length} tracks
            </p>
            <ul className="rounded-2xl overflow-hidden border border-white/[0.06] bg-black/25">
              {tracks.map((t, i) => {
                const isActive = activeId === t.Id;
                return (
                  <li key={t.Id}>
                    <button
                      type="button"
                      onClick={() => playFrom(i)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors',
                        isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
                        i > 0 && 'border-t border-white/[0.05]',
                      )}
                    >
                      <span
                        className={cn(
                          'w-7 text-center text-xs tabular-nums shrink-0',
                          isActive ? 'text-emerald-300 font-bold' : 'text-white/35',
                        )}
                      >
                        {isActive && playingHere ? (
                          <span className="inline-flex gap-0.5 justify-center items-end h-3">
                            <span className="w-0.5 h-2 bg-emerald-300 animate-pulse rounded-full" />
                            <span className="w-0.5 h-3 bg-emerald-300 animate-pulse rounded-full [animation-delay:100ms]" />
                            <span className="w-0.5 h-1.5 bg-emerald-300 animate-pulse rounded-full [animation-delay:200ms]" />
                          </span>
                        ) : (
                          trackLabel(t, i)
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-sm truncate',
                            isActive ? 'text-emerald-100 font-semibold' : 'text-white/90',
                          )}
                        >
                          {displayTitle(t)}
                        </span>
                        {albumArtistLine(t) && albumArtistLine(t) !== albumArtist ? (
                          <span className="block text-[11px] text-white/40 truncate">
                            {albumArtistLine(t)}
                          </span>
                        ) : (
                          <span className="block text-[11px] text-white/35 truncate">
                            {albumArtist || ' '}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-white/35 tabular-nums shrink-0">
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
    </div>
  );

  if (typeof document === 'undefined') return body;
  return createPortal(body, document.body);
}
