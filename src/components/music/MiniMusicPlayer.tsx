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
      const SIZE = {
        // Compact: slightly wider/taller bar so art + controls fit without feeling cramped
        compact: { w: 440, h: 148 },
        // Expanded: tight height so now-playing fills the window; queue is just below the fold
        expanded: { w: 320, h: 420 },
      };

      // @ts-expect-error Chromium Document PiP
      const pipWin: Window = await window.documentPictureInPicture.requestWindow({
        width: SIZE.compact.w,
        height: SIZE.compact.h,
      });
      pipWindowRef.current = pipWin;
      setPipOpen(true);

      // Chromium often ignores requestWindow size or reuses last PiP size — force compact
      try {
        pipWin.resizeTo(SIZE.compact.w, SIZE.compact.h);
      } catch {
        /* ignore */
      }

      /** Average / dominant-ish color from album art (canvas sample). */
      const sampleArtColor = (url: string): Promise<{ r: number; g: number; b: number } | null> =>
        new Promise((resolve) => {
          if (!url) {
            resolve(null);
            return;
          }
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const c = document.createElement('canvas');
              const w = 24;
              const h = 24;
              c.width = w;
              c.height = h;
              const ctx = c.getContext('2d', { willReadFrequently: true });
              if (!ctx) {
                resolve(null);
                return;
              }
              ctx.drawImage(img, 0, 0, w, h);
              const data = ctx.getImageData(0, 0, w, h).data;
              let r = 0;
              let g = 0;
              let b = 0;
              let n = 0;
              for (let i = 0; i < data.length; i += 4) {
                const a = data[i + 3] ?? 0;
                if (a < 128) continue;
                const rr = data[i] ?? 0;
                const gg = data[i + 1] ?? 0;
                const bb = data[i + 2] ?? 0;
                // Skip near-white / near-black for a more musical tint
                const max = Math.max(rr, gg, bb);
                const min = Math.min(rr, gg, bb);
                if (max < 28 || min > 230) continue;
                r += rr;
                g += gg;
                b += bb;
                n++;
              }
              if (!n) {
                resolve(null);
                return;
              }
              // Boost saturation slightly so the wash reads clearly against black
              let rr = r / n, gg = g / n, bb = b / n;
              const avg = (rr + gg + bb) / 3;
              const boost = 1.35;
              rr = Math.max(0, Math.min(255, avg + (rr - avg) * boost));
              gg = Math.max(0, Math.min(255, avg + (gg - avg) * boost));
              bb = Math.max(0, Math.min(255, avg + (bb - avg) * boost));
              // Floor brightness so dark covers still tint
              const maxc = Math.max(rr, gg, bb);
              if (maxc < 90) {
                const scale = 90 / maxc;
                rr = Math.min(255, rr * scale);
                gg = Math.min(255, gg * scale);
                bb = Math.min(255, bb * scale);
              }
              resolve({ r: Math.round(rr), g: Math.round(gg), b: Math.round(bb) });
            } catch {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });

      const style = pipWin.document.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; }
        html, body {
          margin: 0; height: 100%; width: 100%;
          background: #0a0a0c;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          color: #f4f4f5;
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
        }
        .root {
          height: 100%; width: 100%; position: relative;
          --pip-r: 16; --pip-g: 185; --pip-b: 129;
          --pip-bg: rgb(16, 16, 20);
        }
        .root::before {
          content: '';
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 120% 90% at 20% 15%,
              rgba(var(--pip-r), var(--pip-g), var(--pip-b), 0.72), transparent 52%),
            radial-gradient(ellipse 80% 70% at 85% 80%,
              rgba(var(--pip-r), var(--pip-g), var(--pip-b), 0.35), transparent 50%),
            linear-gradient(180deg,
              rgba(var(--pip-r), var(--pip-g), var(--pip-b), 0.38) 0%,
              rgba(12, 12, 16, 0.55) 42%,
              rgba(6, 6, 8, 0.97) 100%);
          pointer-events: none;
          z-index: 0;
        }

        .compact, .expanded { position: relative; z-index: 1; }

        /* —— Compact bar —— */
        .compact {
          height: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px 12px 12px;
        }
        .compact .art {
          width: 108px; height: 108px;
          border-radius: 14px;
          object-fit: cover;
          background: #1c1c22;
          flex-shrink: 0;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(0,0,0,0.45);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .compact .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .compact .title {
          font-size: 15px; font-weight: 650;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .compact .sub {
          font-size: 12px; color: rgba(255,255,255,0.55);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .compact .transport {
          display: flex; align-items: center; justify-content: center; gap: 4px;
        }
        .compact .progress-row {
          display: grid;
          grid-template-columns: 34px 1fr 38px;
          align-items: center; gap: 8px;
        }

        /* —— Expanded (Greenamp-style: now-playing pane, then queue) —— */
        .expanded {
          height: 100%;
          display: none;
          flex-direction: column;
          padding: 8px 10px 6px;
          overflow: hidden;
        }
        .expanded .top {
          display: flex; justify-content: flex-start; align-items: center;
          padding-bottom: 4px; flex-shrink: 0;
        }
        .expanded .collapse {
          appearance: none; border: 0; background: transparent;
          color: rgba(255,255,255,0.45); cursor: pointer;
          display: flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
        }
        .expanded .collapse:hover { color: rgba(255,255,255,0.85); }
        .expanded .scroll {
          flex: 1; min-height: 0;
          overflow-y: auto; overscroll-behavior: contain;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .expanded .now-pane {
          min-height: 100%;
          height: 100%;
          scroll-snap-align: start;
          scroll-snap-stop: always;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
          padding-bottom: 4px;
        }
        .expanded .art-wrap {
          width: 100%;
          max-width: 180px;
          margin: 4px auto 0;
          aspect-ratio: 1;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 12px 36px rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.12);
          cursor: pointer;
          flex-shrink: 0;
        }
        .expanded .art-wrap img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        .expanded .meta {
          text-align: center; margin-top: 10px; min-width: 0; padding: 0 4px;
        }
        .expanded .title {
          font-size: 15px; font-weight: 700; letter-spacing: -0.01em;
          line-height: 1.25;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .expanded .artist {
          margin-top: 3px; font-size: 12px; color: rgba(255,255,255,0.7);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .expanded .album {
          margin-top: 2px; font-size: 11px; color: rgba(255,255,255,0.42);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .expanded .progress-row {
          display: grid;
          grid-template-columns: 34px 1fr 34px;
          align-items: center; gap: 8px;
          margin-top: 10px;
          padding: 0 4px;
        }
        .expanded .transport {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 8px;
        }
        .expanded .queue-hint {
          margin-top: auto;
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 8px 0 4px;
          color: rgba(255,255,255,0.4);
          font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
          cursor: pointer; border: 0; background: transparent; width: 100%;
        }
        .expanded .queue-hint:hover { color: rgba(255,255,255,0.75); }
        .expanded .queue-section {
          min-height: 100%;
          scroll-snap-align: start;
          scroll-snap-stop: always;
          padding-top: 8px;
        }
        .expanded .queue-head {
          display: flex; align-items: center; justify-content: space-between; gap: 6px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: rgba(255,255,255,0.45);
          margin-bottom: 8px; padding: 0 2px;
          position: sticky; top: 0;
          background: linear-gradient(180deg, rgba(8,8,10,0.92), rgba(8,8,10,0.75));
          padding-top: 4px; padding-bottom: 6px;
        }
        .expanded .queue-list { display: flex; flex-direction: column; gap: 2px; }
        .expanded .q-row {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 8px; border-radius: 10px;
          cursor: pointer; border: 0; background: transparent;
          color: inherit; text-align: left; width: 100%;
        }
        .expanded .q-row:hover { background: rgba(255,255,255,0.06); }
        .expanded .q-row.active {
          background: rgba(var(--pip-r), var(--pip-g), var(--pip-b), 0.2);
          box-shadow: inset 0 0 0 1px rgba(var(--pip-r), var(--pip-g), var(--pip-b), 0.35);
        }
        .expanded .q-art {
          width: 36px; height: 36px; border-radius: 8px; object-fit: cover;
          background: #1c1c22; flex-shrink: 0;
        }
        .expanded .q-meta { min-width: 0; flex: 1; }
        .expanded .q-title {
          font-size: 12px; font-weight: 600;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .expanded .q-sub {
          font-size: 10px; color: rgba(255,255,255,0.4);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .expanded .q-dur {
          font-size: 10px; color: rgba(255,255,255,0.35);
          font-variant-numeric: tabular-nums; flex-shrink: 0;
        }

        .tbtn {
          appearance: none; border: 0; background: transparent;
          color: rgba(255,255,255,0.9);
          width: 34px; height: 34px; border-radius: 999px;
          display: grid; place-items: center; cursor: pointer;
        }
        .tbtn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .tbtn.play {
          width: 46px; height: 46px;
          background: #fff; color: #18181b;
        }
        .tbtn.play:hover { background: #f0fdf4; }
        .tbtn svg { width: 16px; height: 16px; fill: currentColor; }
        .tbtn.play svg { width: 18px; height: 18px; }
        .time {
          font-size: 10px; font-variant-numeric: tabular-nums;
          color: rgba(255,255,255,0.45);
        }
        .time.right { text-align: right; }
        .bar {
          position: relative; height: 4px; border-radius: 999px;
          background: rgba(255,255,255,0.14); cursor: pointer;
          overflow: hidden;
        }
        .bar-fill {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: rgb(var(--pip-r), var(--pip-g), var(--pip-b));
          border-radius: 999px;
          pointer-events: none;
          box-shadow: 0 0 8px rgba(var(--pip-r), var(--pip-g), var(--pip-b), 0.45);
        }
        .mode-compact .compact { display: flex; }
        .mode-compact .expanded { display: none; }
        .mode-expanded .compact { display: none; }
        .mode-expanded .expanded { display: flex; }
      `;
      pipWin.document.head.appendChild(style);

      const root = pipWin.document.createElement('div');
      root.className = 'root mode-compact';
      root.innerHTML = `
        <div class="compact">
          <img class="art c-art" alt="" title="Expand" />
          <div class="main">
            <div class="title c-title"></div>
            <div class="sub c-sub"></div>
            <div class="transport">
              <button type="button" class="tbtn prev" aria-label="Previous">
                <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/></svg>
              </button>
              <button type="button" class="tbtn play" aria-label="Play/Pause">
                <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
                <svg class="icon-pause" viewBox="0 0 24 24" style="display:none"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>
              </button>
              <button type="button" class="tbtn next" aria-label="Next">
                <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"/></svg>
              </button>
            </div>
            <div class="progress-row">
              <span class="time elapsed">0:00</span>
              <div class="bar" data-seek><div class="bar-fill"></div></div>
              <span class="time right remain">0:00</span>
            </div>
          </div>
        </div>
        <div class="expanded">
          <div class="top">
            <button type="button" class="collapse" aria-label="Collapse">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
              Mini
            </button>
          </div>
          <div class="scroll">
            <div class="now-pane">
              <div class="art-wrap"><img class="e-art" alt="" /></div>
              <div class="meta">
                <div class="title e-title"></div>
                <div class="artist e-artist"></div>
                <div class="album e-album"></div>
              </div>
              <div class="progress-row">
                <span class="time elapsed e-elapsed">0:00</span>
                <div class="bar" data-seek><div class="bar-fill e-fill"></div></div>
                <span class="time right remain e-remain">0:00</span>
              </div>
              <div class="transport">
                <button type="button" class="tbtn prev" aria-label="Previous">
                  <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/></svg>
                </button>
                <button type="button" class="tbtn play e-play" aria-label="Play/Pause">
                  <svg class="e-icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
                  <svg class="e-icon-pause" viewBox="0 0 24 24" style="display:none"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>
                </button>
                <button type="button" class="tbtn next" aria-label="Next">
                  <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"/></svg>
                </button>
              </div>
              <button type="button" class="queue-hint" aria-label="Show queue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                Queue
              </button>
            </div>
            <div class="queue-section">
              <div class="queue-head"><span>Up next</span></div>
              <div class="queue-list"></div>
            </div>
          </div>
        </div>
      `;
      pipWin.document.body.appendChild(root);

      const fmt = (sec: number) => {
        if (!Number.isFinite(sec) || sec < 0) return '0:00';
        const s = Math.floor(sec % 60);
        const m = Math.floor(sec / 60);
        return m + ':' + String(s).padStart(2, '0');
      };

      let lastArtUrl = '';
      const applyTheme = (rgb: { r: number; g: number; b: number } | null) => {
        const r = rgb?.r ?? 16;
        const g = rgb?.g ?? 185;
        const b = rgb?.b ?? 129;
        root.style.setProperty('--pip-r', String(r));
        root.style.setProperty('--pip-g', String(g));
        root.style.setProperty('--pip-b', String(b));
      };

      const setExpanded = (v: boolean) => {
        root.className = v ? 'root mode-expanded' : 'root mode-compact';
        const sz = v ? SIZE.expanded : SIZE.compact;
        try {
          pipWin.resizeTo(sz.w, sz.h);
        } catch {
          /* some browsers block resizeTo */
        }
        // Always land on now-playing (not queue) when expanding
        if (v) {
          requestAnimationFrame(() => {
            const scroll = root.querySelector('.scroll') as HTMLElement | null;
            if (scroll) scroll.scrollTop = 0;
          });
        }
      };

      const wireTransport = (scope: ParentNode) => {
        scope.querySelectorAll('.prev').forEach((el) => {
          (el as HTMLButtonElement).onclick = () => mpRef.current.previous();
        });
        scope.querySelectorAll('.next').forEach((el) => {
          (el as HTMLButtonElement).onclick = () => mpRef.current.next();
        });
        scope.querySelectorAll('.play').forEach((el) => {
          (el as HTMLButtonElement).onclick = () => mpRef.current.togglePlay();
        });
        scope.querySelectorAll('[data-seek]').forEach((el) => {
          (el as HTMLElement).onclick = (e) => {
            const m = mpRef.current;
            if (!m.duration) return;
            const rect = (el as HTMLElement).getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            m.seek(pct * m.duration);
          };
        });
      };
      wireTransport(root);

      (root.querySelector('.c-art') as HTMLElement).onclick = () => setExpanded(true);
      (root.querySelector('.collapse') as HTMLElement).onclick = () => setExpanded(false);
      // Art stays decorative in expanded — collapse via Mini only
      const scrollEl = root.querySelector('.scroll') as HTMLElement;
      const queueHint = root.querySelector('.queue-hint') as HTMLElement | null;
      if (queueHint && scrollEl) {
        queueHint.onclick = () => {
          const qs = root.querySelector('.queue-section') as HTMLElement | null;
          qs?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      }

      const renderQueue = () => {
        const list = root.querySelector('.queue-list');
        if (!list) return;
        const m = mpRef.current;
        list.innerHTML = '';
        if (!m.queue.length) {
          const empty = pipWin.document.createElement('p');
          empty.textContent = 'Queue is empty';
          empty.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.35);padding:8px;text-align:center';
          list.appendChild(empty);
          return;
        }
        m.queue.forEach((track, i) => {
          const row = pipWin.document.createElement('button');
          row.type = 'button';
          row.className = 'q-row' + (i === m.queueIndex ? ' active' : '');
          const artUrl =
            embyPosterUrl(track, 72) ||
            (m.album ? embyPosterUrl(m.album, 72) : '') ||
            '';
          const title = displayTitle(track);
          const artist =
            albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
          row.innerHTML =
            (artUrl
              ? '<img class="q-art" src="' + artUrl.replace(/"/g, '') + '" alt="" />'
              : '<div class="q-art"></div>') +
            '<div class="q-meta"><div class="q-title"></div><div class="q-sub"></div></div>' +
            '<span class="q-dur"></span>';
          (row.querySelector('.q-title') as HTMLElement).textContent = title;
          (row.querySelector('.q-sub') as HTMLElement).textContent = artist;
          (row.querySelector('.q-dur') as HTMLElement).textContent = fmt(
            (track.RunTimeTicks || 0) / 10_000_000,
          );
          row.onclick = () => mpRef.current.playTrackAt(i);
          list.appendChild(row);
        });
      };

      const render = () => {
        const m = mpRef.current;
        const track = m.currentTrack;
        if (!track) return;
        const artUrl =
          embyPosterUrl(m.album?.ImageTags?.Primary ? m.album : track, 320) ||
          embyPosterUrl(track, 320);
        const title = displayTitle(track);
        const artist =
          albumArtistLine(track) || track.AlbumArtist || track.Artists?.[0] || '';
        const album = track.Album || m.album?.Name || '';
        const sub = [artist, album].filter(Boolean).join(' · ');

        if (artUrl && artUrl !== lastArtUrl) {
          lastArtUrl = artUrl;
          void sampleArtColor(artUrl).then(applyTheme);
        }

        root.querySelectorAll('.c-art, .e-art').forEach((img) => {
          const el = img as HTMLImageElement;
          if (artUrl && el.src !== artUrl) el.src = artUrl;
        });
        const cTitle = root.querySelector('.c-title') as HTMLElement;
        const cSub = root.querySelector('.c-sub') as HTMLElement;
        const eTitle = root.querySelector('.e-title') as HTMLElement;
        const eArtist = root.querySelector('.e-artist') as HTMLElement;
        const eAlbum = root.querySelector('.e-album') as HTMLElement;
        if (cTitle) cTitle.textContent = title;
        if (cSub) cSub.textContent = sub;
        if (eTitle) eTitle.textContent = title;
        if (eArtist) eArtist.textContent = artist;
        if (eAlbum) eAlbum.textContent = album;

        const playing = m.isPlaying;
        root.querySelectorAll('.icon-play, .e-icon-play').forEach((el) => {
          (el as HTMLElement).style.display = playing ? 'none' : 'block';
        });
        root.querySelectorAll('.icon-pause, .e-icon-pause').forEach((el) => {
          (el as HTMLElement).style.display = playing ? 'block' : 'none';
        });

        const dur = m.duration || 0;
        const pos = m.position || 0;
        const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
        root.querySelectorAll('.bar-fill').forEach((el) => {
          (el as HTMLElement).style.width = pct + '%';
        });
        root.querySelectorAll('.elapsed').forEach((el) => {
          (el as HTMLElement).textContent = fmt(pos);
        });
        root.querySelectorAll('.remain').forEach((el) => {
          (el as HTMLElement).textContent = dur > 0 ? fmt(dur) : '0:00';
        });

        if (root.classList.contains('mode-expanded')) {
          const sig =
            m.queue.map((x) => x.Id).join(',') + '|' + String(m.queueIndex);
          if (sig !== (root as HTMLElement & { __qSig?: string }).__qSig) {
            (root as HTMLElement & { __qSig?: string }).__qSig = sig;
            renderQueue();
          }
        }
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
