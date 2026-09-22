/**
 * Persistent Greenamp mini bar — fixed corner, draggable, optional Document PiP.
 * Same MusicPlayerContext session; hidden while expanded player is open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ListMusic,
  PictureInPicture2,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { albumArtistLine, displayTitle, embyPosterUrl } from '../../lib/emby';
import { cn } from '../../lib/cn';
import { MusicControls } from './MusicControls';
import { MusicProgress } from './MusicProgress';

type Corner = 'br' | 'bl' | 'tr' | 'tl';

const CORNER_CLASS: Record<Corner, string> = {
  br: 'bottom-3 right-3 left-auto top-auto',
  bl: 'bottom-3 left-3 right-auto top-auto',
  tr: 'top-3 right-3 left-auto bottom-auto',
  tl: 'top-3 left-3 right-auto bottom-auto',
};

function loadCorner(): Corner {
  try {
    const c = localStorage.getItem('greenhq-music-corner');
    if (c === 'br' || c === 'bl' || c === 'tr' || c === 'tl') return c;
  } catch {
    /* ignore */
  }
  return 'br';
}

function saveCorner(c: Corner) {
  try {
    localStorage.setItem('greenhq-music-corner', c);
  } catch {
    /* ignore */
  }
}

function nearestCorner(x: number, y: number): Corner {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const right = x >= cx;
  const bottom = y >= cy;
  if (bottom && right) return 'br';
  if (bottom && !right) return 'bl';
  if (!bottom && right) return 'tr';
  return 'tl';
}

export function MiniMusicPlayer() {
  const mp = useMusicPlayer();
  const [corner, setCorner] = useState<Corner>(() => loadCorner());
  const [dragging, setDragging] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipOpen, setPipOpen] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    setPipSupported(
      typeof window !== 'undefined' && 'documentPictureInPicture' in window,
    );
  }, []);

  const openPip = useCallback(async () => {
    if (!('documentPictureInPicture' in window)) return;
    try {
      // @ts-expect-error Chromium Document PiP
      const pipWin: Window = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: 120,
      });
      pipWindowRef.current = pipWin;
      setPipOpen(true);
      // Minimal styles in PiP window
      const style = pipWin.document.createElement('style');
      style.textContent = `
        html,body{margin:0;height:100%;background:#09090b;color:#fff;font:13px/1.3 system-ui,sans-serif}
        .row{display:flex;align-items:center;gap:10px;padding:10px;height:100%;box-sizing:border-box}
        img{width:64px;height:64px;border-radius:10px;object-fit:cover;background:#222}
        .meta{min-width:0;flex:1}
        .t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .a{opacity:.55;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        button{background:#fff;color:#111;border:0;border-radius:999px;padding:8px 12px;font-weight:600;cursor:pointer}
      `;
      pipWin.document.head.appendChild(style);
      const root = pipWin.document.createElement('div');
      root.className = 'row';
      pipWin.document.body.appendChild(root);

      const render = () => {
        const track = mp.currentTrack;
        if (!track) return;
        const art =
          embyPosterUrl(mp.album?.ImageTags?.Primary ? mp.album! : track, 128) ||
          embyPosterUrl(track, 128);
        root.innerHTML = '';
        if (art) {
          const img = pipWin.document.createElement('img');
          img.src = art;
          root.appendChild(img);
        }
        const meta = pipWin.document.createElement('div');
        meta.className = 'meta';
        meta.innerHTML = `<div class="t"></div><div class="a"></div>`;
        (meta.querySelector('.t') as HTMLElement).textContent = displayTitle(track);
        (meta.querySelector('.a') as HTMLElement).textContent =
          albumArtistLine(track) || track.AlbumArtist || '';
        root.appendChild(meta);
        const btn = pipWin.document.createElement('button');
        btn.textContent = mp.isPlaying ? 'Pause' : 'Play';
        btn.onclick = () => mp.togglePlay();
        root.appendChild(btn);
      };
      render();
      const id = window.setInterval(render, 800);
      pipWin.addEventListener('pagehide', () => {
        window.clearInterval(id);
        pipWindowRef.current = null;
        setPipOpen(false);
      });
    } catch {
      setPipOpen(false);
    }
  }, [mp]);

  // Drag to snap corner
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      // visual feedback via cursor only — snap on release
      void e;
    };
    const onUp = (e: PointerEvent) => {
      const c = nearestCorner(e.clientX, e.clientY);
      setCorner(c);
      saveCorner(c);
      setDragging(false);
      dragOrigin.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  if (!mp.currentTrack || !mp.miniVisible || mp.expanded) return null;

  const track = mp.currentTrack;
  const title = displayTitle(track);
  const artist =
    albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
  const albumName = track.Album || mp.album?.Name || '';
  const art =
    embyPosterUrl(mp.album && mp.album.ImageTags?.Primary ? mp.album : track, 128) ||
    embyPosterUrl(track, 128);

  return (
    <div
      ref={shellRef}
      className={cn(
        'fixed z-[90] pointer-events-none',
        'pb-[env(safe-area-inset-bottom)]',
        CORNER_CLASS[corner],
        dragging && 'opacity-80',
      )}
      role="region"
      aria-label="Now playing"
    >
      <div
        className={cn(
          'pointer-events-auto w-[min(100vw-1.5rem,22rem)] sm:w-[22rem]',
          'rounded-2xl border border-white/[0.08]',
          'bg-zinc-950/92 backdrop-blur-xl',
          'shadow-2xl shadow-black/50 ring-1 ring-black/30',
          'select-none',
        )}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-1.5 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={() => setDragging(true)}
          title="Drag to a corner"
        >
          <span className="w-8 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-3 pt-1">
          <MusicProgress
            position={mp.position}
            duration={mp.duration}
            onSeek={mp.seek}
            compact
          />
        </div>

        <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1.5">
          <button
            type="button"
            onClick={() => mp.setExpanded(true)}
            className={cn(
              'shrink-0 w-11 h-11 rounded-xl overflow-hidden',
              'border border-white/10 bg-white/5 shadow-md',
              'hover:ring-1 hover:ring-emerald-400/30 transition-all',
            )}
            aria-label="Open Greenamp"
          >
            {art ? (
              <img src={art} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-900/50 to-zinc-800" />
            )}
          </button>

          <button
            type="button"
            onClick={() => mp.setExpanded(true)}
            className="min-w-0 flex-1 text-left group"
          >
            <p className="text-sm font-semibold text-white truncate leading-tight group-hover:text-emerald-100">
              {title}
            </p>
            <p className="text-[11px] text-white/50 truncate mt-0.5">
              {[artist, albumName].filter(Boolean).join(' · ')}
            </p>
          </button>

          <MusicControls
            size="sm"
            isPlaying={mp.isPlaying}
            onPrev={mp.previous}
            onToggle={mp.togglePlay}
            onNext={mp.next}
            className="shrink-0"
          />
        </div>

        {/* Secondary row: shuffle / repeat / volume / queue / pip / close */}
        <div className="flex items-center gap-0.5 px-2 pb-2 border-t border-white/[0.05] pt-1.5">
          <button
            type="button"
            onClick={mp.toggleShuffle}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              mp.shuffle ? 'text-emerald-300' : 'text-white/35 hover:text-white',
            )}
            aria-label="Shuffle"
            title="Shuffle"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={mp.cycleRepeat}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              mp.repeat !== 'off' ? 'text-emerald-300' : 'text-white/35 hover:text-white',
            )}
            aria-label="Repeat"
            title={`Repeat: ${mp.repeat}`}
          >
            {mp.repeat === 'one' ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="hidden sm:flex items-center gap-1 flex-1 min-w-0 px-1">
            <button
              type="button"
              onClick={mp.toggleMute}
              className="p-1 text-white/40 hover:text-white"
              aria-label={mp.muted ? 'Unmute' : 'Mute'}
            >
              {mp.muted || mp.volume <= 0 ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mp.muted ? 0 : mp.volume}
              onChange={(e) => mp.setVolume(Number(e.target.value))}
              className="w-full h-1 appearance-none rounded-full bg-white/12 cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5
                [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white"
              aria-label="Volume"
            />
          </div>
          <div className="flex-1 sm:hidden" />

          <button
            type="button"
            onClick={() => {
              mp.setQueueOpen(true);
              mp.setExpanded(true);
            }}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"
            aria-label="Queue"
          >
            <ListMusic className="w-3.5 h-3.5" />
          </button>

          {pipSupported ? (
            <button
              type="button"
              onClick={() => void openPip()}
              className={cn(
                'p-1.5 rounded-lg hover:bg-white/10',
                pipOpen ? 'text-emerald-300' : 'text-white/40 hover:text-white',
              )}
              aria-label="Pop out player"
              title="Pop out (Picture-in-Picture)"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={mp.stop}
            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10"
            aria-label="Stop and close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
