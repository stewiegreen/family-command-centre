/**
 * Lightweight canvas confetti — no npm dependency.
 *
 *   import { fireConfetti } from '../lib/confetti';
 *   fireConfetti();
 *   fireConfetti({ origin: { x: 0.5, y: 0.3 }, count: 90 });
 *   fireConfetti({ count: 200, power: 18 }); // big level-up
 */

export type ConfettiOrigin = { x: number; y: number }; // 0–1 relative to viewport

export type ConfettiOptions = {
  /** Number of particles (default 80) */
  count?: number;
  /** Launch velocity (default 12; level-up ~18) */
  power?: number;
  /** Burst origin as fractions of the viewport (default center-topish) */
  origin?: ConfettiOrigin;
  /** Particle colours */
  colors?: string[];
  /** How long particles live in ms (default 2500) */
  duration?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  maxLife: number;
};

const DEFAULT_COLORS = [
  '#f472b6', // pink
  '#a78bfa', // violet
  '#38bdf8', // sky
  '#34d399', // emerald
  '#fbbf24', // amber
  '#fb7185', // rose
  '#f97316', // orange
  '#e879f9', // fuchsia
];

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];

let running = false;

function ensureCanvas(): CanvasRenderingContext2D {
  if (canvas && ctx) return ctx;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('canvas 2d unavailable');
  ctx = c;
  const resize = () => {
    if (!canvas) return;
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  return c;
}

function tick() {
  if (!ctx || !canvas) return;
  const c = ctx;
  c.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const g = 0.18;
  const next: Particle[] = [];
  for (const p of particles) {
    p.vy += g;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life += 16;
    const t = p.life / p.maxLife;
    if (t >= 1) continue;
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.globalAlpha = Math.max(0, alpha);
    c.fillStyle = p.color;
    c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    c.restore();
    next.push(p);
  }
  particles = next;
  if (particles.length) {
     requestAnimationFrame(tick);
  } else {
    running = false;
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

/** Burst confetti. Safe to call from anywhere (browser only). */
export function fireConfetti(opts: ConfettiOptions = {}): void {
  if (typeof document === 'undefined') return;
  const count = opts.count ?? 80;
  const power = opts.power ?? 12;
  const origin = opts.origin ?? { x: 0.5, y: 0.35 };
  const colors = opts.colors ?? DEFAULT_COLORS;
  const duration = opts.duration ?? 2500;

  ensureCanvas();
  const ox = origin.x * window.innerWidth;
  const oy = origin.y * window.innerHeight;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.4 + Math.random() * 0.8) * power;
    particles.push({
      x: ox + (Math.random() - 0.5) * 24,
      y: oy + (Math.random() - 0.5) * 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - power * 0.35,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: colors[i % colors.length]!,
      life: 0,
      maxLife: duration * (0.7 + Math.random() * 0.5),
    });
  }

  if (!running) {
    running = true;
     requestAnimationFrame(tick);
  }
}

/** React-friendly alias matching `const fire = useConfetti()`. */
export function useConfetti(): (opts?: ConfettiOptions) => void {
  return fireConfetti;
}
