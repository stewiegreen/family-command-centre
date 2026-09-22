/**
 * Global music session — persists across GreenHQ navigation.
 * Owns the single <audio> element and Emby stream attempts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  albumArtistLine,
  displayTitle,
  embyAudioPlayAttempts,
  embyPlaybackInfo,
  embyPosterUrl,
  embyReportProgress,
  embyReportStart,
  embyReportStop,
  secondsToTicks,
  type EmbyItem,
} from '../lib/emby';

export type MusicRepeat = 'off' | 'all' | 'one';
export type MusicTrack = EmbyItem;

export type MusicPlayerState = {
  currentTrack: MusicTrack | null;
  album: EmbyItem | null;
  queue: MusicTrack[];
  queueIndex: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: MusicRepeat;
  miniVisible: boolean;
  expanded: boolean;
  queueOpen: boolean;
  loading: boolean;
  error: string | null;
  /** Emby user for stream URLs — set with each playTracks call. */
  embyUserId: string | null;
};

type PlayTracksOpts = {
  tracks: MusicTrack[];
  startIndex?: number;
  album?: EmbyItem | null;
  autoplay?: boolean;
  embyUserId: string;
};

type MusicPlayerContextValue = MusicPlayerState & {
  /** Alias for position (seconds) — mirrors the audio element. */
  currentTime: number;
  /** Play a single track (starts Emby stream on the global <audio>). */
  playTrack: (
    track: MusicTrack,
    opts: { embyUserId: string; album?: EmbyItem | null; autoplay?: boolean },
  ) => void;
  playTracks: (opts: PlayTracksOpts) => void;
  playTrackAt: (index: number) => void;
  togglePlay: () => void;
  /** Alias for togglePlay */
  togglePlayPause: () => void;
  play: () => void;
  /** Alias for play */
  resume: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setMiniVisible: (v: boolean) => void;
  setExpanded: (v: boolean) => void;
  setQueueOpen: (v: boolean) => void;
  stop: () => void;
  minimize: () => void;
  /** Remove a track from the queue by index. */
  removeFromQueue: (index: number) => void;
  /** Underlying <audio> for visualizer (same instance as playback). */
  getAudioElement: () => HTMLAudioElement | null;
  /** Web Audio analyser (lazy); routes element → analyser → destination once. */
  ensureAnalyser: () => AnalyserNode | null;
  /** Alias for playTracks — brief-compatible name. */
  playQueue: (opts: PlayTracksOpts) => void;
  /** Append tracks after the current queue (does not jump). */
  addToQueue: (tracks: MusicTrack[], embyUserId: string) => void;
  /** Insert tracks to play after the current track. */
  playNext: (tracks: MusicTrack[], embyUserId: string) => void;
  /** Reorder queue: move index `from` to `to`. */
  moveInQueue: (from: number, to: number) => void;
};

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

const initial: MusicPlayerState = {
  currentTrack: null,
  album: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.85,
  muted: false,
  shuffle: false,
  repeat: 'off',
  miniVisible: false,
  expanded: false,
  queueOpen: false,
  loading: false,
  error: null,
  embyUserId: null,
};

function loadPrefs(): Pick<MusicPlayerState, 'volume' | 'muted' | 'shuffle' | 'repeat'> {
  try {
    const raw = localStorage.getItem('greenhq-music-prefs');
    if (!raw) return { volume: 0.85, muted: false, shuffle: false, repeat: 'off' };
    const p = JSON.parse(raw) as Partial<MusicPlayerState>;
    const volume = typeof p.volume === 'number' ? Math.max(0, Math.min(1, p.volume)) : 0.85;
    const muted = Boolean(p.muted);
    const shuffle = Boolean(p.shuffle);
    const repeat: MusicRepeat =
      p.repeat === 'all' || p.repeat === 'one' || p.repeat === 'off' ? p.repeat : 'off';
    return { volume, muted, shuffle, repeat };
  } catch {
    return { volume: 0.85, muted: false, shuffle: false, repeat: 'off' };
  }
}

function savePrefs(partial: Partial<MusicPlayerState>) {
  try {
    const cur = loadPrefs();
    const next = {
      volume: partial.volume ?? cur.volume,
      muted: partial.muted ?? cur.muted,
      shuffle: partial.shuffle ?? cur.shuffle,
      repeat: partial.repeat ?? cur.repeat,
    };
    localStorage.setItem('greenhq-music-prefs', JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MusicPlayerState>(() => ({
    ...initial,
    ...loadPrefs(),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceWired = useRef(false);
  const mediaSourceId = useRef<string | undefined>(undefined);
  const playSessionId = useRef<string | undefined>(undefined);
  const startedRef = useRef(false);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const attemptsRef = useRef<string[]>([]);
  const trackIdRef = useRef<string | null>(null);

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearTimeout(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const reportStop = useCallback(async (itemId: string, ticks: number) => {
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
  }, []);

  const loadStream = useCallback(async (item: EmbyItem, userId: string, startSeconds = 0) => {
    const start = Math.max(0, startSeconds);
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      position: start,
    }));
    startedRef.current = start > 0.5; // already "started" if mid-track seek reload
    mediaSourceId.current = undefined;
    playSessionId.current = undefined;
    attemptRef.current = 0;
    trackIdRef.current = item.Id;

    try {
      try {
        const info = await embyPlaybackInfo(userId, item.Id);
        const ms = info.MediaSources?.[0];
        mediaSourceId.current = ms?.Id;
        playSessionId.current = info.PlaySessionId || ms?.Id;
      } catch {
        /* optional */
      }
      const attempts = embyAudioPlayAttempts({
        itemId: item.Id,
        userId,
        mediaSourceId: mediaSourceId.current,
        playSessionId: playSessionId.current,
        startTicks: start > 0.25 ? secondsToTicks(start) : undefined,
      });
      attemptsRef.current = attempts;
      const src = attempts[0] || null;
      const el = audioRef.current;
      if (el && src) {
        el.src = src;
        el.load();
      }
      const durationSec =
        typeof item.RunTimeTicks === 'number' ? item.RunTimeTicks / 10_000_000 : 0;
      setState((s) => ({
        ...s,
        loading: false,
        duration: durationSec || s.duration,
        position: start,
        error: src ? null : 'No playable stream',
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Could not load track',
        isPlaying: false,
      }));
    }
  }, []);

  const tryNextAttempt = useCallback(() => {
    const next = attemptRef.current + 1;
    const list = attemptsRef.current;
    if (next >= list.length) {
      setState((s) => ({
        ...s,
        error:
          'Could not play this track in the browser (tried MP3 transcode + direct). FLAC may need Emby transcoding.',
        isPlaying: false,
        loading: false,
      }));
      return;
    }
    attemptRef.current = next;
    const src = list[next];
    const el = audioRef.current;
    if (el && src) {
      el.src = src;
      el.load();
      setState((s) => ({ ...s, error: null, loading: true }));
      void el.play().then(() => setState((s) => ({ ...s, loading: false }))).catch(() => tryNextAttempt());
    }
  }, []);

  const playTracks = useCallback(
    (opts: PlayTracksOpts) => {
      const tracks = opts.tracks.filter(Boolean);
      if (!tracks.length || !opts.embyUserId) return;
      const startIndex = Math.min(Math.max(0, opts.startIndex ?? 0), tracks.length - 1);
      const track = tracks[startIndex]!;
      const durationSec =
        typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;

      setState((s) => ({
        ...s,
        queue: tracks,
        queueIndex: startIndex,
        currentTrack: track,
        album: opts.album ?? null,
        position: 0,
        duration: durationSec,
        isPlaying: opts.autoplay !== false,
        miniVisible: true,
        expanded: false,
        embyUserId: opts.embyUserId,
        error: null,
      }));
      void loadStream(track, opts.embyUserId);
    },
    [loadStream],
  );

  const playTrack = useCallback(
    (
      track: MusicTrack,
      opts: { embyUserId: string; album?: EmbyItem | null; autoplay?: boolean },
    ) => {
      playTracks({
        tracks: [track],
        startIndex: 0,
        album: opts.album ?? null,
        autoplay: opts.autoplay !== false,
        embyUserId: opts.embyUserId,
      });
    },
    [playTracks],
  );

  const playTrackAt = useCallback(
    (index: number) => {
      const s = stateRef.current;
      if (index < 0 || index >= s.queue.length || !s.embyUserId) return;
      const track = s.queue[index]!;
      const durationSec =
        typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
      setState((prev) => ({
        ...prev,
        queueIndex: index,
        currentTrack: track,
        position: 0,
        duration: durationSec,
        isPlaying: true,
        miniVisible: true,
      }));
      void loadStream(track, s.embyUserId);
    },
    [loadStream],
  );

  const togglePlay = useCallback(() => {
    setState((s) => {
      if (!s.currentTrack) return s;
      return { ...s, isPlaying: !s.isPlaying, miniVisible: true };
    });
  }, []);

  const play = useCallback(() => {
    setState((s) => (s.currentTrack ? { ...s, isPlaying: true, miniVisible: true } : s));
  }, []);

  const pause = useCallback(() => {
    setState((s) => ({ ...s, isPlaying: false }));
  }, []);

  const next = useCallback(() => {
    const s = stateRef.current;
    if (!s.queue.length || !s.embyUserId) return;
    if (s.repeat === 'one') {
      const el = audioRef.current;
      if (el) {
        el.currentTime = 0;
        void el.play();
      }
      setState((prev) => ({ ...prev, position: 0, isPlaying: true }));
      return;
    }
    let nextIndex: number;
    if (s.shuffle && s.queue.length > 1) {
      // Random other track
      do {
        nextIndex = Math.floor(Math.random() * s.queue.length);
      } while (nextIndex === s.queueIndex && s.queue.length > 1);
    } else {
      nextIndex = s.queueIndex + 1;
      if (nextIndex >= s.queue.length) {
        if (s.repeat === 'all') nextIndex = 0;
        else {
          setState((prev) => ({ ...prev, isPlaying: false }));
          return;
        }
      }
    }
    const track = s.queue[nextIndex]!;
    const durationSec =
      typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
    setState((prev) => ({
      ...prev,
      queueIndex: nextIndex,
      currentTrack: track,
      position: 0,
      duration: durationSec,
      isPlaying: true,
      miniVisible: true,
    }));
    void loadStream(track, s.embyUserId);
  }, [loadStream]);

  const previous = useCallback(() => {
    const s = stateRef.current;
    if (!s.queue.length || !s.embyUserId) return;
    if (s.position > 3) {
      const el = audioRef.current;
      if (el) el.currentTime = 0;
      setState((prev) => ({ ...prev, position: 0 }));
      return;
    }
    const prevIndex = Math.max(0, s.queueIndex - 1);
    const track = s.queue[prevIndex]!;
    const durationSec =
      typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
    setState((prev) => ({
      ...prev,
      queueIndex: prevIndex,
      currentTrack: track,
      position: 0,
      duration: durationSec,
      isPlaying: true,
      miniVisible: true,
    }));
    void loadStream(track, s.embyUserId);
  }, [loadStream]);

  const seek = useCallback(
    (seconds: number) => {
      const s = stateRef.current;
      const el = audioRef.current;
      const metaDur =
        s.duration > 0
          ? s.duration
          : typeof s.currentTrack?.RunTimeTicks === 'number'
            ? s.currentTrack.RunTimeTicks / 10_000_000
            : 0;
      const elDur =
        el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      const dur = elDur || metaDur;
      const target = Math.max(0, dur > 0 ? Math.min(seconds, dur) : Math.max(0, seconds));

      setState((prev) => ({ ...prev, position: target }));

      // Prefer native seek when the stream reports seekable ranges
      const canNative =
        el &&
        el.seekable &&
        el.seekable.length > 0 &&
        el.readyState >= 1;

      if (canNative && el) {
        try {
          el.currentTime = target;
          // Transcode/progressive streams often ignore currentTime — fall back to StartTimeTicks
          window.setTimeout(() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (Math.abs(audio.currentTime - target) <= 1.25) {
              setState((prev) => ({ ...prev, position: audio.currentTime }));
              return;
            }
            const st = stateRef.current;
            if (st.currentTrack && st.embyUserId) {
              void loadStream(st.currentTrack, st.embyUserId, target);
            }
          }, 120);
          return;
        } catch {
          /* fall through to reload */
        }
      }

      // Emby progressive/transcode: reload stream at StartTimeTicks
      if (s.currentTrack && s.embyUserId) {
        void loadStream(s.currentTrack, s.embyUserId, target);
      }
    },
    [loadStream],
  );

  const setVolume = useCallback((v: number) => {
    const vol = Math.max(0, Math.min(1, v));
    if (audioRef.current) audioRef.current.volume = vol;
    setState((s) => {
      const next = {
        ...s,
        volume: vol,
        muted: vol <= 0,
      };
      savePrefs({ volume: vol, muted: vol <= 0 });
      return next;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setState((s) => {
      const muted = !s.muted;
      if (audioRef.current) audioRef.current.muted = muted;
      savePrefs({ muted, volume: s.volume });
      return { ...s, muted };
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setState((s) => {
      const shuffle = !s.shuffle;
      savePrefs({ shuffle, repeat: s.repeat, volume: s.volume, muted: s.muted });
      return { ...s, shuffle };
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setState((s) => {
      const repeat: MusicRepeat =
        s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off';
      savePrefs({ repeat, shuffle: s.shuffle, volume: s.volume, muted: s.muted });
      return { ...s, repeat };
    });
  }, []);

  const setMiniVisible = useCallback((v: boolean) => {
    setState((s) => ({ ...s, miniVisible: v }));
  }, []);

  const setExpanded = useCallback((v: boolean) => {
    setState((s) => ({ ...s, expanded: v }));
  }, []);

  const setQueueOpen = useCallback((v: boolean) => {
    setState((s) => ({ ...s, queueOpen: v }));
  }, []);

  const stop = useCallback(() => {
    const s = stateRef.current;
    const el = audioRef.current;
    if (s.currentTrack && el) {
      void reportStop(s.currentTrack.Id, secondsToTicks(el.currentTime));
    }
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    clearProgressTimer();
    setState(initial);
  }, [reportStop]);

  const minimize = useCallback(() => {
    setState((s) => ({ ...s, miniVisible: false, expanded: false, queueOpen: false }));
  }, []);

  const removeFromQueue = useCallback(
    (index: number) => {
      const s = stateRef.current;
      if (index < 0 || index >= s.queue.length) return;
      const removedCurrent = index === s.queueIndex;
      const queue = s.queue.filter((_, i) => i !== index);
      if (!queue.length) {
        stop();
        return;
      }
      let queueIndex = s.queueIndex;
      if (index < s.queueIndex) queueIndex -= 1;
      else if (removedCurrent) {
        queueIndex = Math.min(index, queue.length - 1);
      }
      const track = queue[queueIndex]!;
      const durationSec =
        typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
      setState((prev) => ({
        ...prev,
        queue,
        queueIndex,
        currentTrack: track,
        duration: removedCurrent ? durationSec : prev.duration,
        position: removedCurrent ? 0 : prev.position,
      }));
      if (removedCurrent && s.embyUserId) {
        void loadStream(track, s.embyUserId);
      }
    },
    [loadStream, stop],
  );

  const addToQueue = useCallback((tracks: MusicTrack[], embyUserId: string) => {
    const clean = tracks.filter(Boolean);
    if (!clean.length) return;
    const s = stateRef.current;
    if (!s.currentTrack || !s.queue.length) {
      playTracks({ tracks: clean, startIndex: 0, autoplay: true, embyUserId });
      return;
    }
    setState((prev) => ({
      ...prev,
      queue: [...prev.queue, ...clean],
      embyUserId: prev.embyUserId || embyUserId,
      miniVisible: true,
    }));
  }, [playTracks]);

  const playNext = useCallback((tracks: MusicTrack[], embyUserId: string) => {
    const clean = tracks.filter(Boolean);
    if (!clean.length) return;
    const s = stateRef.current;
    if (!s.currentTrack || !s.queue.length) {
      playTracks({ tracks: clean, startIndex: 0, autoplay: true, embyUserId });
      return;
    }
    setState((prev) => {
      const insertAt = prev.queueIndex + 1;
      const queue = [
        ...prev.queue.slice(0, insertAt),
        ...clean,
        ...prev.queue.slice(insertAt),
      ];
      return {
        ...prev,
        queue,
        embyUserId: prev.embyUserId || embyUserId,
        miniVisible: true,
      };
    });
  }, [playTracks]);

  const moveInQueue = useCallback((from: number, to: number) => {
    setState((s) => {
      if (from < 0 || from >= s.queue.length || to < 0 || to >= s.queue.length || from === to) {
        return s;
      }
      const queue = [...s.queue];
      const [item] = queue.splice(from, 1);
      queue.splice(to, 0, item!);
      let queueIndex = s.queueIndex;
      if (from === s.queueIndex) queueIndex = to;
      else if (from < s.queueIndex && to >= s.queueIndex) queueIndex -= 1;
      else if (from > s.queueIndex && to <= s.queueIndex) queueIndex += 1;
      return { ...s, queue, queueIndex };
    });
  }, []);

  const getAudioElement = useCallback(() => audioRef.current, []);

  const ensureAnalyser = useCallback(() => {
    const el = audioRef.current;
    if (!el || typeof window === 'undefined') return null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      if (!mediaSourceWired.current) {
        const source = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
        mediaSourceWired.current = true;
      }
      return analyserRef.current;
    } catch {
      return analyserRef.current;
    }
  }, []);

  // Sync play/pause + volume to element
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = state.muted ? 0 : state.volume;
    el.muted = state.muted;
    if (state.isPlaying) {
      void el.play().catch(() => tryNextAttempt());
    } else {
      el.pause();
    }
  }, [state.isPlaying, state.volume, state.muted, tryNextAttempt]);

  // After src load, try play if needed
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !state.currentTrack) return;
    const onCanPlay = () => {
      setState((s) => ({ ...s, loading: false }));
      if (stateRef.current.isPlaying) {
        void el.play().catch(() => tryNextAttempt());
      }
    };
    const onTimeUpdate = () => {
      const track = stateRef.current.currentTrack;
      if (!track) return;
      setState((s) => ({
        ...s,
        position: el.currentTime,
        duration: el.duration && Number.isFinite(el.duration) ? el.duration : s.duration,
      }));
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
        const t = stateRef.current.currentTrack;
        if (!t) return;
        void embyReportProgress({
          itemId: t.Id,
          mediaSourceId: mediaSourceId.current,
          playSessionId: playSessionId.current,
          positionTicks: secondsToTicks(el.currentTime),
          isPaused: el.paused,
        });
      }, 800);
    };
    const onEnded = () => {
      const t = stateRef.current.currentTrack;
      if (t) void reportStop(t.Id, secondsToTicks(el.currentTime));
      // next() handles shuffle / repeat-all / end-of-queue
      nextRef.current();
    };
    const onError = () => tryNextAttempt();

    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [loadStream, reportStop, tryNextAttempt, state.currentTrack?.Id]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      clearProgressTimer();
      const el = audioRef.current;
      const t = trackIdRef.current;
      if (el && t) {
        void embyReportStop({
          itemId: t,
          mediaSourceId: mediaSourceId.current,
          playSessionId: playSessionId.current,
          positionTicks: secondsToTicks(el.currentTime),
        });
      }
    };
  }, []);

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      ...state,
      currentTime: state.position,
      playTrack,
      playTracks,
      playTrackAt,
      togglePlay,
      togglePlayPause: togglePlay,
      play,
      resume: play,
      pause,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setMiniVisible,
      setExpanded,
      setQueueOpen,
      stop,
      minimize,
      removeFromQueue,
      getAudioElement,
      ensureAnalyser,
      playQueue: playTracks,
      addToQueue,
      playNext,
      moveInQueue,
    }),
    [
      state,
      playTrack,
      playTracks,
      playTrackAt,
      togglePlay,
      play,
      pause,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setMiniVisible,
      setExpanded,
      setQueueOpen,
      stop,
      minimize,
      removeFromQueue,
      getAudioElement,
      ensureAnalyser,
      addToQueue,
      playNext,
      moveInQueue,
    ],
  );

  // Media Session API — lock screen / headphone / OS media keys
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const track = state.currentTrack;
    if (!track) {
      try {
        navigator.mediaSession.metadata = null;
      } catch {
        /* ignore */
      }
      return;
    }
    const art = embyPosterUrl(state.album && state.album.ImageTags?.Primary ? state.album : track, 512);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle(track),
        artist: albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '',
        album: track.Album || state.album?.Name || '',
        artwork: art
          ? [
              { src: art, sizes: '512x512', type: 'image/jpeg' },
              { src: art, sizes: '256x256', type: 'image/jpeg' },
            ]
          : [],
      });
      navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
      if (state.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: state.duration,
          playbackRate: 1,
          position: Math.min(state.position, state.duration),
        });
      }
    } catch {
      /* some browsers reject position state */
    }
  }, [state.currentTrack, state.album, state.isPlaying, state.position, state.duration]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler('play', () => play());
      ms.setActionHandler('pause', () => pause());
      ms.setActionHandler('previoustrack', () => previous());
      ms.setActionHandler('nexttrack', () => next());
      ms.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') seek(details.seekTime);
      });
      ms.setActionHandler('stop', () => stop());
    } catch {
      /* unsupported action */
    }
    return () => {
      try {
        ms.setActionHandler('play', null);
        ms.setActionHandler('pause', null);
        ms.setActionHandler('previoustrack', null);
        ms.setActionHandler('nexttrack', null);
        ms.setActionHandler('seekto', null);
        ms.setActionHandler('stop', null);
      } catch {
        /* ignore */
      }
    };
  }, [play, pause, previous, next, seek, stop]);

  // Keyboard shortcuts (ignore when typing in inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!stateRef.current.currentTrack) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seek(stateRef.current.position + 5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seek(Math.max(0, stateRef.current.position - 5));
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setVolume(Math.min(1, stateRef.current.volume + 0.05));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setVolume(Math.max(0, stateRef.current.volume - 0.05));
      } else if (e.code === 'KeyM') {
        toggleMute();
      } else if (e.code === 'KeyN') {
        next();
      } else if (e.code === 'KeyP') {
        previous();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, setVolume, toggleMute, next, previous]);

  return (
    <MusicPlayerContext.Provider value={value}>
      {/* Single persistent audio element — survives page changes */}
      <audio ref={audioRef} preload="metadata" className="hidden" />
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  return ctx;
}

export function useMusicPlayerOptional(): MusicPlayerContextValue | null {
  return useContext(MusicPlayerContext);
}
