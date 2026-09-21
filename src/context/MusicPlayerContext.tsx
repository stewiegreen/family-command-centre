/**
 * Global music session for GreenHQ Mini Music Player.
 * Step 1: state + mini-player visibility across navigation.
 * Step 2+: Emby audio element, queue, progress reporting live here.
 *
 * Does NOT replace VideoPlayer / AlbumPlayer yet — those stay until
 * MediaPage is wired to this context in a later step.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { EmbyItem } from '../lib/emby';

export type MusicRepeat = 'off' | 'all' | 'one';

export type MusicTrack = EmbyItem;

export type MusicPlayerState = {
  /** Current track (null = nothing loaded → mini player hidden). */
  currentTrack: MusicTrack | null;
  /** Album/container for art fallback and “playing from”. */
  album: EmbyItem | null;
  queue: MusicTrack[];
  queueIndex: number;
  isPlaying: boolean;
  /** Seconds */
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: MusicRepeat;
  /** Mini bar visible (user can dismiss without clearing session). */
  miniVisible: boolean;
  /** Expanded full player (Step 3). */
  expanded: boolean;
  /** Queue drawer (Step 4). */
  queueOpen: boolean;
};

type MusicPlayerContextValue = MusicPlayerState & {
  /** Replace session (album + tracks). Used by MediaPage later. */
  playTracks: (opts: {
    tracks: MusicTrack[];
    startIndex?: number;
    album?: EmbyItem | null;
    autoplay?: boolean;
  }) => void;
  playTrackAt: (index: number) => void;
  togglePlay: () => void;
  play: () => void;
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
  /** Stop and clear session (Close on mini player). */
  stop: () => void;
  /** Soft dismiss mini chrome; keeps session so it can be reopened later. */
  minimize: () => void;
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
};

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MusicPlayerState>(initial);

  const playTracks = useCallback(
    (opts: {
      tracks: MusicTrack[];
      startIndex?: number;
      album?: EmbyItem | null;
      autoplay?: boolean;
    }) => {
      const tracks = opts.tracks.filter(Boolean);
      if (!tracks.length) return;
      const startIndex = Math.min(
        Math.max(0, opts.startIndex ?? 0),
        tracks.length - 1,
      );
      const track = tracks[startIndex]!;
      const durationSec =
        typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
      setState((s) => ({
        ...s,
        queue: tracks,
        queueIndex: startIndex,
        currentTrack: track,
        album: opts.album ?? s.album,
        position: 0,
        duration: durationSec,
        isPlaying: opts.autoplay !== false,
        miniVisible: true,
        expanded: false,
      }));
    },
    [],
  );

  const playTrackAt = useCallback((index: number) => {
    setState((s) => {
      if (index < 0 || index >= s.queue.length) return s;
      const track = s.queue[index]!;
      const durationSec =
        typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
      return {
        ...s,
        queueIndex: index,
        currentTrack: track,
        position: 0,
        duration: durationSec,
        isPlaying: true,
        miniVisible: true,
      };
    });
  }, []);

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
    setState((s) => {
      if (!s.queue.length) return s;
      let nextIndex = s.queueIndex + 1;
      if (nextIndex >= s.queue.length) {
        if (s.repeat === 'all') nextIndex = 0;
        else return { ...s, isPlaying: false };
      }
      const track = s.queue[nextIndex]!;
      const durationSec =
        typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
      return {
        ...s,
        queueIndex: nextIndex,
        currentTrack: track,
        position: 0,
        duration: durationSec,
        isPlaying: true,
        miniVisible: true,
      };
    });
  }, []);

  const previous = useCallback(() => {
    setState((s) => {
      if (!s.queue.length) return s;
      // Restart current if more than 3s in
      if (s.position > 3) {
        return { ...s, position: 0 };
      }
      const prevIndex = Math.max(0, s.queueIndex - 1);
      const track = s.queue[prevIndex]!;
      const durationSec =
        typeof track.RunTimeTicks === 'number' ? track.RunTimeTicks / 10_000_000 : 0;
      return {
        ...s,
        queueIndex: prevIndex,
        currentTrack: track,
        position: 0,
        duration: durationSec,
        isPlaying: true,
        miniVisible: true,
      };
    });
  }, []);

  const seek = useCallback((seconds: number) => {
    setState((s) => ({
      ...s,
      position: Math.max(0, Math.min(seconds, s.duration || seconds)),
    }));
  }, []);

  const setVolume = useCallback((v: number) => {
    setState((s) => ({
      ...s,
      volume: Math.max(0, Math.min(1, v)),
      muted: v <= 0 ? true : s.muted && v > 0 ? false : s.muted,
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((s) => ({ ...s, muted: !s.muted }));
  }, []);

  const toggleShuffle = useCallback(() => {
    setState((s) => ({ ...s, shuffle: !s.shuffle }));
  }, []);

  const cycleRepeat = useCallback(() => {
    setState((s) => ({
      ...s,
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    }));
  }, []);

  const setMiniVisible = useCallback((v: boolean) => {
    setState((s) => ({ ...s, miniVisible: v }));
  }, []);

  const setExpanded = useCallback((v: boolean) => {
    setState((s) => ({ ...s, expanded: v, miniVisible: v ? s.miniVisible : s.miniVisible }));
  }, []);

  const setQueueOpen = useCallback((v: boolean) => {
    setState((s) => ({ ...s, queueOpen: v }));
  }, []);

  const stop = useCallback(() => {
    setState(initial);
  }, []);

  const minimize = useCallback(() => {
    setState((s) => ({ ...s, miniVisible: false, expanded: false, queueOpen: false }));
  }, []);

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      ...state,
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
    }),
    [
      state,
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
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  }
  return ctx;
}

/** Optional hook when provider may be absent (tests). */
export function useMusicPlayerOptional(): MusicPlayerContextValue | null {
  return useContext(MusicPlayerContext);
}
