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

  // Keep latest player API for PiP interval (avoids stale closures)
  const mpRef = useRef(mp);
  mpRef.current = mp;

  const openPip = useCallback(async () => {
    if (!('documentPictureInPicture' in window)) return;
    try {
      // @ts-expect-error Chromium Document PiP
      const pipWin: Window = await window.documentPictureInPicture.requestWindow({
        width: 380,
        height: 132,
      });
      pipWindowRef.current = pipWin;
      setPipOpen(true);

      const style = pipWin.document.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; }
        html, body {
          margin: 0; height: 100%;
          background: transparent;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          color: #f4f4f5;
          -webkit-font-smoothing: antialiased;
        }
        .shell {
          height: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px 10px 10px;
          background: linear-gradient(145deg, rgba(36,36,42,0.97), rgba(18,18,22,0.98));
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.45);
        }
        .art {
          width: 96px; height: 96px;
          border-radius: 12px;
          object-fit: cover;
          background: #1c1c22;
          flex-shrink: 0;
          box-shadow: 0 6px 18px rgba(0,0,0,0.4);
        }
        .art-ph {
          width: 96px; height: 96px;
          border-radius: 12px;
          background: linear-gradient(135deg, #064e3b, #27272a);
          flex-shrink: 0;
        }
        .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .title {
          font-size: 15px; font-weight: 650; letter-spacing: -0.01em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          line-height: 1.2;
        }
        .sub {
          font-size: 12px; color: rgba(255,255,255,0.5);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          line-height: 1.2;
        }
        .transport {
          display: flex; align-items: center; justify-content: center; gap: 4px;
          margin-top: 2px;
        }
        .tbtn {
          appearance: none; border: 0; background: transparent;
          color: rgba(255,255,255,0.88);
          width: 34px; height: 34px; border-radius: 999px;
          display: grid; place-items: center; cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        .tbtn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .tbtn.play {
          width: 38px; height: 38px;
          background: rgba(255,255,255,0.12);
        }
        .tbtn.play:hover { background: rgba(255,255,255,0.2); }
        .tbtn svg { width: 16px; height: 16px; fill: currentColor; }
        .tbtn.play svg { width: 18px; height: 18px; }
        .progress-row {
          display: grid;
          grid-template-columns: 36px 1fr 40px;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }
        .time {
          font-size: 10px; font-variant-numeric: tabular-nums;
          color: rgba(255,255,255,0.4); letter-spacing: 0.02em;
        }
        .time.right { text-align: right; }
        .bar {
          position: relative; height: 4px; border-radius: 999px;
          background: rgba(255,255,255,0.12); cursor: pointer;
          overflow: hidden;
        }
        .bar-fill {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: #34d399; border-radius: 999px;
          pointer-events: none;
        }
      `;
      pipWin.document.head.appendChild(style);

      const root = pipWin.document.createElement('div');
      root.className = 'shell';
      root.innerHTML = `
        <img class="art" alt="" />
        <div class="main">
          <div class="title"></div>
          <div class="sub"></div>
          <div class="transport">
            <button type="button" class="tbtn prev" aria-label="Previous" title="Previous">
              <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/></svg>
            </button>
            <button type="button" class="tbtn play" aria-label="Play/Pause" title="Play/Pause">
              <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
              <svg class="icon-pause" viewBox="0 0 24 24" style="display:none"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>
            </button>
            <button type="button" class="tbtn next" aria-label="Next" title="Next">
              <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"/></svg>
            </button>
          </div>
          <div class="progress-row">
            <span class="time elapsed">0:00</span>
            <div class="bar" role="slider" aria-label="Seek"><div class="bar-fill"></div></div>
            <span class="time right remain">-0:00</span>
          </div>
        </div>
      `;
      pipWin.document.body.appendChild(root);

      const artEl = root.querySelector('.art') as HTMLImageElement;
      const titleEl = root.querySelector('.title') as HTMLElement;
      const subEl = root.querySelector('.sub') as HTMLElement;
      const playIcon = root.querySelector('.icon-play') as SVGElement;
      const pauseIcon = root.querySelector('.icon-pause') as SVGElement;
      const fillEl = root.querySelector('.bar-fill') as HTMLElement;
      const elapsedEl = root.querySelector('.elapsed') as HTMLElement;
      const remainEl = root.querySelector('.remain') as HTMLElement;
      const barEl = root.querySelector('.bar') as HTMLElement;

      const fmt = (sec: number) => {
        if (!Number.isFinite(sec) || sec < 0) return '0:00';
        const s = Math.floor(sec % 60);
        const m = Math.floor(sec / 60);
        return m + ':' + String(s).padStart(2, '0');
      };

      (root.querySelector('.prev') as HTMLButtonElement).onclick = () => mpRef.current.previous();
      (root.querySelector('.next') as HTMLButtonElement).onclick = () => mpRef.current.next();
      (root.querySelector('.play') as HTMLButtonElement).onclick = () => mpRef.current.togglePlay();
      barEl.onclick = (e) => {
        const m = mpRef.current;
        if (!m.duration) return;
        const rect = barEl.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        m.seek(pct * m.duration);
      };

      const render = () => {
        const m = mpRef.current;
        const track = m.currentTrack;
        if (!track) return;
        const art =
          embyPosterUrl(m.album?.ImageTags?.Primary ? m.album : track, 192) ||
          embyPosterUrl(track, 192);
        if (art && artEl.src !== art) artEl.src = art;
        titleEl.textContent = displayTitle(track);
        const artist = albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
        const album = track.Album || m.album?.Name || '';
        subEl.textContent = [artist, album].filter(Boolean).join(' – ') || ' ';
        if (m.isPlaying) {
          playIcon.style.display = 'none';
          pauseIcon.style.display = 'block';
        } else {
          playIcon.style.display = 'block';
          pauseIcon.style.display = 'none';
        }
        const dur = m.duration || 0;
        const pos = m.position || 0;
        const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
        fillEl.style.width = pct + '%';
        elapsedEl.textContent = fmt(pos);
        remainEl.textContent = dur > 0 ? '-' + fmt(Math.max(0, dur - pos)) : '-0:00';
      };

      render();
      const id = window.setInterval(render, 250);
      pipWin.addEventListener('pagehide', () => {
        window.clearInterval(id);
        pipWindowRef.current = null;
        setPipOpen(false);
      });
    } catch {
      setPipOpen(false);
    }
  }, []);

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
