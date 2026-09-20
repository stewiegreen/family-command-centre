/**
 * Full-screen album player — art, track list, sequential play via Emby Audio proxy.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
  embyAudioStreamUrl,
  embyAudioTranscodeUrl,
  embyPlaybackInfo,
  embyPosterUrl,
  embyReportProgress,
  embyReportStart,
  embyReportStop,
  formatTicksDuration,
  isAudioItem,
  secondsToTicks,
  type EmbyItem,
} from '../lib/emby';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';

type Props = {
  album: EmbyItem;
  tracks: EmbyItem[];
  userId: string;
  /** Start playing this track index immediately (default: show UI, wait for Play). */
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
  const tracks = rawTracks.filter(isAudioItem);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceId = useRef<string | undefined>(undefined);
  const playSessionId = useRef<string | undefined>(undefined);
  const startedRef = useRef(false);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<'static' | 'transcode'>('static');

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, tracks.length - 1)),
  );
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [src, setSrc] = useState<string | null>(null);

  const track = tracks[index] || null;
  const art = embyPosterUrl(album, 600);
  const artist = albumArtistLine(album) || (track ? albumArtistLine(track) : '');

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearTimeout(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const reportStop = useCallback(
    async (itemId: string, ticks: number) => {
      try {
        await embyReportStop({
          itemId,
          mediaSourceId: mediaSourceId.current,
          playSessionId: playSessionId.current,
          positionTicks: ticks,
        });
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const loadTrack = useCallback(
    async (item: EmbyItem) => {
      setLoading(true);
      setError(null);
      setSrc(null);
      setCurrent(0);
      setDuration(0);
      startedRef.current = false;
      mediaSourceId.current = undefined;
      playSessionId.current = undefined;
      modeRef.current = 'static';
      try {
        const info = await embyPlaybackInfo(userId, item.Id);
        const ms = info.MediaSources?.[0];
        mediaSourceId.current = ms?.Id;
        playSessionId.current = info.PlaySessionId || ms?.Id;
        const url = embyAudioStreamUrl({
          itemId: item.Id,
          userId,
          mediaSourceId: mediaSourceId.current,
          playSessionId: playSessionId.current,
        });
        setSrc(url);
        setLoading(false);
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : 'Could not load track');
        setPlaying(false);
      }
    },
    [userId],
  );

  // Load when track index changes
  useEffect(() => {
    const item = tracks[index];
    if (!item) return;
    void loadTrack(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Autoplay on first open if requested
  useEffect(() => {
    if (autoplay) setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    el.src = src;
    el.load();
    if (playing) {
      void el.play().catch(() => {
        // try transcode
        const item = tracks[index];
        if (!item || modeRef.current === 'transcode') {
          setError('Playback failed');
          setPlaying(false);
          return;
        }
        modeRef.current = 'transcode';
        const url = embyAudioTranscodeUrl({
          itemId: item.Id,
          userId,
          mediaSourceId: mediaSourceId.current,
          playSessionId: playSessionId.current,
        });
        setSrc(url);
      });
    }
  }, [src, playing, index, tracks, userId]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing]);

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || !track) return;
    setCurrent(el.currentTime);
    if (!startedRef.current && el.currentTime > 0.2) {
      startedRef.current = true;
      void embyReportStart({
        itemId: track.Id,
        mediaSourceId: mediaSourceId.current,
        playSessionId: playSessionId.current,
        positionTicks: secondsToTicks(el.currentTime),
      });
    }
    clearProgressTimer();
    progressTimer.current = setTimeout(() => {
      if (!track) return;
      void embyReportProgress({
        itemId: track.Id,
        mediaSourceId: mediaSourceId.current,
        playSessionId: playSessionId.current,
        positionTicks: secondsToTicks(el.currentTime),
        isPaused: el.paused,
      });
    }, 800);
  };

  const onEnded = () => {
    const item = tracks[index];
    if (item) {
      void reportStop(item.Id, secondsToTicks(audioRef.current?.currentTime || 0));
    }
    if (index < tracks.length - 1) {
      setIndex((i) => i + 1);
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  };

  const close = async () => {
    const el = audioRef.current;
    const item = tracks[index];
    if (item && el) {
      await reportStop(item.Id, secondsToTicks(el.currentTime));
    }
    onClose();
  };

  const playFrom = (i: number) => {
    if (i === index) {
      setPlaying(true);
      return;
    }
    setPlaying(true);
    setIndex(i);
  };

  const body = (
    <div className="fixed inset-0 z-[80] bg-[var(--app-page,#0a0a12)] text-fg flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={() => void close()} aria-label="Close">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{displayTitle(album)}</p>
          {artist ? <p className="text-xs text-muted truncate">{artist}</p> : null}
        </div>
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
          </div>

          <div className="flex justify-center gap-3">
            <Button
              type="button"
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  if (!src) void loadTrack(tracks[index]!);
                  setPlaying(true);
                }
              }}
              className="min-w-[10rem]"
            >
              {playing ? (
                <>
                  <Pause className="w-4 h-4 mr-2" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2 fill-current" /> Play album
                </>
              )}
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-red-400 text-center">{error}</p>
          ) : null}

          <ul className="rounded-2xl border border-border divide-y divide-border overflow-hidden bg-elevated">
            {tracks.map((t, i) => {
              const active = i === index;
              return (
                <li key={t.Id}>
                  <button
                    type="button"
                    onClick={() => playFrom(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/10 transition-colors',
                      active && 'bg-accent/15',
                    )}
                  >
                    <span
                      className={cn(
                        'w-7 text-center text-xs tabular-nums shrink-0',
                        active ? 'text-accent font-bold' : 'text-muted',
                      )}
                    >
                      {active && playing ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
                      ) : (
                        trackLabel(t, i)
                      )}
                    </span>
                    <span className={cn('flex-1 min-w-0 text-sm truncate', active && 'font-semibold text-accent')}>
                      {t.Name || `Track ${i + 1}`}
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

      {/* Now playing bar */}
      <div className="shrink-0 border-t border-border bg-elevated/95 backdrop-blur px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {track?.Name || '—'}
            </p>
            <p className="text-[11px] text-muted tabular-nums">
              {formatTicksDuration(secondsToTicks(current))}
              {' / '}
              {formatTicksDuration(track?.RunTimeTicks || secondsToTicks(duration))}
            </p>
          </div>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-muted" /> : null}
          <button
            type="button"
            className="p-2 rounded-full hover:bg-accent/15 text-fg disabled:opacity-30"
            disabled={index <= 0}
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1));
              setPlaying(true);
            }}
            aria-label="Previous"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="p-2.5 rounded-full bg-accent text-white hover:opacity-90"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
          </button>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-accent/15 text-fg disabled:opacity-30"
            disabled={index >= tracks.length - 1}
            onClick={() => {
              setIndex((i) => Math.min(tracks.length - 1, i + 1));
              setPlaying(true);
            }}
            aria-label="Next"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
        <div className="max-w-lg mx-auto mt-2 h-1 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-[width]"
            style={{
              width: `${duration > 0 ? Math.min(100, (current / duration) * 100) : 0}%`,
            }}
          />
        </div>
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (el) setDuration(el.duration || 0);
        }}
        onEnded={onEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        playsInline
      />
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}
