/**
 * GreenHQ Emby player (Phase B)
 * Full-screen HTML5 video via same-origin proxy — API key never in the browser.
 * Falls back to Emby web if the stream cannot play.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  displayTitle,
  embyHlsUrl,
  embyPlaybackInfo,
  embyReportProgress,
  embyReportStart,
  embyReportStop,
  embyStreamUrl,
  embyTranscodeStreamUrl,
  openEmbyItem,
  playedPercent,
  secondsToTicks,
  ticksToSeconds,
  type EmbyItem,
} from '../lib/emby';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';

type Props = {
  item: EmbyItem;
  userId: string;
  webUrl: string;
  serverId: string;
  onClose: () => void;
};

type StreamMode = 'static' | 'transcode' | 'hls';

function prefersHls(): boolean {
  if (typeof document === 'undefined') return false;
  const v = document.createElement('video');
  // Safari / iOS often handle HLS natively
  return v.canPlayType('application/vnd.apple.mpegurl') !== '';
}

export function VideoPlayer({ item, userId, webUrl, serverId, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTicks = useRef(0);
  const mediaSourceId = useRef<string | undefined>(undefined);
  const playSessionId = useRef<string | undefined>(undefined);
  const audioStreamIndex = useRef<number | undefined>(undefined);
  const modeRef = useRef<StreamMode>('static');
  const startedRef = useRef(false);

  const [uiVisible, setUiVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [src, setSrc] = useState<string | null>(null);

  const resumeSeconds = ticksToSeconds(item.UserData?.PlaybackPositionTicks);
  // If nearly finished, start over
  const startAt =
    resumeSeconds > 15 && playedPercent(item) < 95 ? resumeSeconds : 0;

  const bumpUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setUiVisible(false), 3200);
  }, []);

  const buildSrc = useCallback(
    (mode: StreamMode, msId?: string, session?: string, audioIdx?: number) => {
      const common = {
        itemId: item.Id,
        userId,
        mediaSourceId: msId,
        playSessionId: session,
        startTicks: startAt > 0 ? secondsToTicks(startAt) : undefined,
        audioStreamIndex: audioIdx,
      };
      if (mode === 'hls') return embyHlsUrl(common);
      if (mode === 'transcode') return embyTranscodeStreamUrl(common);
      return embyStreamUrl(common);
    },
    [item.Id, userId, startAt],
  );

  // Init stream
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    startedRef.current = false;

    void (async () => {
      let msId: string | undefined;
      let session: string | undefined;
      let audioIdx: number | undefined;
      try {
        const info = await embyPlaybackInfo(userId, item.Id);
        if (cancelled) return;
        const src0 = info.MediaSources?.[0];
        msId = src0?.Id;
        session = info.PlaySessionId;
        mediaSourceId.current = msId;
        playSessionId.current = session;
        audioIdx =
          src0?.DefaultAudioStreamIndex ??
          src0?.MediaStreams?.find((s) => s.Type === 'Audio')?.Index;
        audioStreamIndex.current = audioIdx;
      } catch {
        /* PlaybackInfo optional — still try stream */
      }

      // Prefer H.264+AAC transcode so Chrome/Firefox get real audio (Static often = silent AC3/DTS).
      // Safari can try HLS first (also requests AAC).
      const mode: StreamMode = prefersHls() ? 'hls' : 'transcode';
      modeRef.current = mode;
      if (cancelled) return;
      setSrc(buildSrc(mode, msId, session, audioIdx));
      setLoading(false);
      bumpUi();
    })();

    return () => {
      cancelled = true;
    };
  }, [item.Id, userId, buildSrc, bumpUi]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Flush progress on unmount
  useEffect(() => {
    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const ticks = lastTicks.current;
      if (ticks > 0 || startedRef.current) {
        void embyReportStop({
          itemId: item.Id,
          mediaSourceId: mediaSourceId.current,
          playSessionId: playSessionId.current,
          positionTicks: ticks,
        });
      }
    };
  }, [item.Id]);

  const scheduleProgress = useCallback(
    (seconds: number, isPaused?: boolean) => {
      const ticks = secondsToTicks(seconds);
      lastTicks.current = ticks;
      if (progressTimer.current) clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => {
        void embyReportProgress({
          itemId: item.Id,
          mediaSourceId: mediaSourceId.current,
          playSessionId: playSessionId.current,
          positionTicks: ticks,
          isPaused,
        });
      }, 1500);
    },
    [item.Id],
  );

  const tryNextMode = useCallback(() => {
    const order: StreamMode[] = prefersHls()
      ? ['hls', 'transcode', 'static']
      : ['transcode', 'static', 'hls'];
    const idx = order.indexOf(modeRef.current);
    const next = order[idx + 1];
    if (!next) {
      setError('Could not play this title in the browser. Try Open in Emby.');
      setLoading(false);
      return;
    }
    modeRef.current = next;
    setLoading(true);
    setError(null);
    setSrc(
      buildSrc(
        next,
        mediaSourceId.current,
        playSessionId.current,
        audioStreamIndex.current,
      ),
    );
  }, [buildSrc]);

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    if (startAt > 0 && Math.abs(v.currentTime - startAt) > 2) {
      try {
        v.currentTime = startAt;
      } catch {
        /* ignore */
      }
    }
    setLoading(false);
    void v.play().catch(() => {
      /* user gesture may be required */
    });
  };

  const onPlay = () => {
    setPlaying(true);
    if (!startedRef.current) {
      startedRef.current = true;
      void embyReportStart({
        itemId: item.Id,
        mediaSourceId: mediaSourceId.current,
        playSessionId: playSessionId.current,
        positionTicks: secondsToTicks(videoRef.current?.currentTime || startAt),
      });
    }
  };

  const onPause = () => {
    setPlaying(false);
    if (videoRef.current) scheduleProgress(videoRef.current.currentTime, true);
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    scheduleProgress(v.currentTime, v.paused);
  };

  const onError = () => {
    setLoading(false);
    tryNextMode();
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
    bumpUi();
  };

  const seek = (seconds: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, seconds));
    scheduleProgress(v.currentTime, v.paused);
    bumpUi();
  };

  const handleClose = () => {
    const v = videoRef.current;
    const ticks = secondsToTicks(v?.currentTime || lastTicks.current / 10_000_000);
    lastTicks.current = ticks;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    void embyReportStop({
      itemId: item.Id,
      mediaSourceId: mediaSourceId.current,
      playSessionId: playSessionId.current,
      positionTicks: ticks,
    }).finally(() => onClose());
  };

  const openExternal = () => {
    openEmbyItem({ webUrl, serverId, itemId: item.Id });
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        seek((videoRef.current?.currentTime || 0) + 10);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seek((videoRef.current?.currentTime || 0) - 10);
      }
      if (e.key === 'f') {
        e.preventDefault();
        void toggleFullscreen();
      }
      bumpUi();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const ui = (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[200] flex flex-col bg-black text-white"
      onMouseMove={bumpUi}
      onClick={bumpUi}
    >
      {/* Top bar */}
      <div
        className={cn(
          'absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-2 sm:px-3 h-12 bg-gradient-to-b from-black/85 to-transparent transition-opacity duration-300',
          uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-xl hover:bg-white/10"
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{displayTitle(item)}</p>
          <p className="text-[11px] text-white/55">Playing in GreenHQ</p>
        </div>
        <button
          type="button"
          onClick={openExternal}
          className="p-2 rounded-xl hover:bg-white/10 hidden sm:inline-flex"
          aria-label="Open in Emby"
          title="Open in Emby"
        >
          <ExternalLink className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="p-2 rounded-xl hover:bg-white/10 hidden sm:inline-flex"
          aria-label={isFs ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      {/* Stage */}
      <div className="flex-1 relative flex items-center justify-center min-h-0">
        {src && (
          <video
            ref={videoRef}
            key={src}
            src={src}
            className="max-h-full max-w-full w-full h-full object-contain bg-black"
            playsInline
            // Never start muted — silent playback was a common failure mode with Static streams
            muted={false}
            autoPlay
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            onLoadedMetadata={(e) => { e.currentTarget.muted = false; e.currentTarget.volume = 1; onLoadedMetadata(e); }}
            onPlay={onPlay}
            onPause={onPause}
            onTimeUpdate={onTimeUpdate}
            onWaiting={() => setLoading(true)}
            onPlaying={() => setLoading(false)}
            onError={onError}
            controls={false}
          />
        )}

        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-10 h-10 animate-spin text-white/80" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm w-full rounded-2xl bg-black/90 border border-white/15 p-5 space-y-3 text-center">
              <p className="text-sm text-white/90">{error}</p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    modeRef.current = prefersHls() ? 'hls' : 'transcode';
                    setError(null);
                    setLoading(true);
                    setSrc(
                      buildSrc(
                        modeRef.current,
                        mediaSourceId.current,
                        playSessionId.current,
                        audioStreamIndex.current,
                      ),
                    );
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Try again
                </Button>
                <Button variant="secondary" onClick={openExternal}>
                  <ExternalLink className="w-4 h-4" />
                  Open in Emby
                </Button>
                <Button variant="secondary" onClick={handleClose}>
                  Back
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          'absolute bottom-0 inset-x-0 z-20 px-3 sm:px-4 pb-4 pt-10 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300',
          uiVisible && !error ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Number.isFinite(current) ? current : 0}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full accent-amber-400 h-1.5 mb-3"
          aria-label="Seek"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="p-2 rounded-xl hover:bg-white/10"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
          </button>
          <span className="text-xs tabular-nums text-white/75 min-w-[6.5rem]">
            {fmt(current)} / {fmt(duration)}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={openExternal} className="!text-xs">
            Emby
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return ui;
  return createPortal(ui, document.body);
}
