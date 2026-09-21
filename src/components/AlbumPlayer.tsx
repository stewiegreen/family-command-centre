/**
 * Album browser UI — track list + art.
 * All audio is owned by MusicPlayerContext (global <audio> + Emby streams).
 * Closing this sheet does NOT stop playback; the mini player continues.
 */
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
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
import { Button } from './ui/Button';
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

  const art = embyPosterUrl(album, 600);
  const artist = albumArtistLine(album);

  // Hand session to global player once on open (no local <audio>)
  useEffect(() => {
    if (!tracks.length || !userId) return;
    const idx = Math.min(Math.max(0, startIndex), tracks.length - 1);
    const sameAlbum =
      music.album?.Id === album.Id &&
      music.queue.length === tracks.length &&
      tracks[0] &&
      music.queue[0]?.Id === tracks[0].Id;

    if (sameAlbum) {
      // Already playing this album — jump to requested track if needed, don't rebuild session
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
    music.isPlaying &&
    Boolean(activeId && tracks.some((t) => t.Id === activeId));

  const playFrom = (i: number) => {
    if (!tracks.length || !userId) return;
    // Ensure queue is this album, then jump
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
    <div className="fixed inset-0 z-[80] bg-[var(--app-page,#0a0a12)] text-fg flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{displayTitle(album)}</p>
          {artist ? <p className="text-xs text-muted truncate">{artist}</p> : null}
        </div>
        {music.loading ? <Loader2 className="w-4 h-4 animate-spin text-muted shrink-0" /> : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-6 pb-28 space-y-6">
          <div className="aspect-square max-w-xs mx-auto rounded-2xl overflow-hidden border border-border shadow-lg bg-surface-2">
            <img src={art} alt="" className="w-full h-full object-cover" />
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold tracking-tight">{displayTitle(album)}</h1>
            {artist ? <p className="text-sm text-muted">{artist}</p> : null}
            <p className="text-xs text-muted">{tracks.length} tracks</p>
            {music.error ? (
              <p className="text-xs text-red-400 mt-2 px-2">{music.error}</p>
            ) : null}
          </div>

          <div className="flex justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => music.previous()}
              aria-label="Previous"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
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
                  music.togglePlayPause();
                }
              }}
              aria-label={playingHere ? 'Pause' : 'Play'}
            >
              {playingHere ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => music.next()}
              aria-label="Next"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          <ul className="space-y-0.5 rounded-2xl border border-border overflow-hidden bg-surface-1">
            {tracks.map((t, i) => {
              const isActive = activeId === t.Id;
              return (
                <li key={t.Id}>
                  <button
                    type="button"
                    onClick={() => playFrom(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      isActive
                        ? 'bg-accent/15 text-fg'
                        : 'hover:bg-nav-hover text-fg',
                    )}
                  >
                    <span
                      className={cn(
                        'w-7 text-center text-xs tabular-nums shrink-0',
                        isActive ? 'text-accent font-bold' : 'text-muted',
                      )}
                    >
                      {isActive && playingHere ? (
                        <span className="inline-block w-3 h-3 rounded-sm bg-accent animate-pulse" />
                      ) : (
                        trackLabel(t, i)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm truncate', isActive && 'font-semibold')}>
                        {displayTitle(t)}
                      </span>
                      {albumArtistLine(t) && albumArtistLine(t) !== artist ? (
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

  if (typeof document === 'undefined') return body;
  return createPortal(body, document.body);
}
