/**
 * Greenamp visualizer — same MusicPlayerContext AnalyserNode / single <audio>.
 *
 * hero  → radial spectrum (square art replacement): energetic, centered, Plexamp-ish
 * inline → mirrored log bars under controls
 *
 * Design notes:
 * - Log-spaced frequency bins so bass doesn’t pile on the left
 * - Asymmetric smooth (fast attack / slower release)
 * - Soft glow via layered strokes, low CPU (~30–36fps)
 */
import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { cn } from '../../lib/cn';

function sampleLogBins(
  data: Uint8Array,
  binCount: number,
  out: Float32Array,
): void {
  const n = data.length;
  if (n < 2) {
    out.fill(0);
    return;
  }
  // Skip DC + very low bins; map log across rest
  const minIdx = 2;
  const maxIdx = n - 1;
  for (let i = 0; i < binCount; i++) {
    const t0 = i / binCount;
    const t1 = (i + 1) / binCount;
    const i0 = Math.floor(minIdx * Math.pow(maxIdx / minIdx, t0));
    const i1 = Math.max(i0 + 1, Math.floor(minIdx * Math.pow(maxIdx / minIdx, t1)));
    let sum = 0;
    let count = 0;
    for (let j = i0; j < i1 && j < n; j++) {
      sum += data[j] || 0;
      count++;
    }
    out[i] = count ? sum / count / 255 : 0;
  }
}

export function MusicVisualizer({
  className,
  variant = 'inline',
}: {
  className?: string;
  variant?: 'inline' | 'hero';
}) {
  const { isPlaying, ensureAnalyser } = useMusicPlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let alive = true;
    const barCount = variant === 'hero' ? 96 : 48;
    const freqData = new Uint8Array(256);
    const bins = new Float32Array(barCount);
    const smooth = new Float32Array(barCount);
    let lastFrame = 0;
    const minFrameMs = 1000 / 32;
    let rotation = 0;

    const drawHero = (ts: number, w: number, h: number) => {
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);

      // Deep vignette
      const bg = ctx.createRadialGradient(cx, cy, minDim * 0.05, cx, cy, minDim * 0.55);
      bg.addColorStop(0, 'rgba(6, 78, 59, 0.25)');
      bg.addColorStop(0.45, 'rgba(0, 0, 0, 0.15)');
      bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Bass energy → subtle core pulse
      let bass = 0;
      for (let i = 0; i < Math.min(8, bins.length); i++) bass += bins[i] || 0;
      bass /= 8;
      const coreR = minDim * (0.14 + bass * 0.06 * (playingRef.current ? 1 : 0.3));

      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.8);
      coreGrad.addColorStop(0, `rgba(167, 243, 208, ${0.12 + bass * 0.25})`);
      coreGrad.addColorStop(0.5, `rgba(16, 185, 129, ${0.08 + bass * 0.1})`);
      coreGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Inner ring
      ctx.strokeStyle = `rgba(52, 211, 153, ${0.25 + bass * 0.35})`;
      ctx.lineWidth = Math.max(1.5, minDim * 0.004);
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.stroke();

      const baseR = minDim * 0.22;
      const maxBar = minDim * 0.28;
      rotation += (playingRef.current ? 0.0012 : 0.0003) + bass * 0.002;

      for (let i = 0; i < barCount; i++) {
        const t = bins[i] || 0;
        const shaped = Math.pow(t, 0.75);
        const target = shaped * maxBar * (playingRef.current ? 1 : 0.18);
        // Fast attack, slow release
        const prev = smooth[i] || 0;
        smooth[i] = target > prev ? prev * 0.35 + target * 0.65 : prev * 0.82 + target * 0.18;
        const barLen = Math.max(minDim * 0.012, smooth[i]!);

        const angle = (i / barCount) * Math.PI * 2 + rotation;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x0 = cx + cos * baseR;
        const y0 = cy + sin * baseR;
        const x1 = cx + cos * (baseR + barLen);
        const y1 = cy + sin * (baseR + barLen);

        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
        grad.addColorStop(0.4, 'rgba(52, 211, 153, 0.85)');
        grad.addColorStop(1, 'rgba(204, 251, 241, 0.95)');

        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(2, (minDim * 0.55) / barCount);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // Soft outer glow tip
        if (barLen > maxBar * 0.25) {
          ctx.strokeStyle = `rgba(167, 243, 208, ${0.15 + shaped * 0.25})`;
          ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.5);
          ctx.beginPath();
          ctx.moveTo(x1 - cos * 2, y1 - sin * 2);
          ctx.lineTo(x1 + cos * 4, y1 + sin * 4);
          ctx.stroke();
        }
      }

      // Outer soft ring
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + maxBar * 0.95, 0, Math.PI * 2);
      ctx.stroke();

      void ts;
    };

    const drawInline = (ts: number, w: number, h: number) => {
      const midY = h * 0.55;
      const half = Math.floor(barCount / 2);
      const gap = Math.max(1.5, w * 0.004);
      const totalBars = barCount;
      const barW = (w - gap * (totalBars - 1)) / totalBars;

      for (let i = 0; i < barCount; i++) {
        // Mirror: low freqs center, high freqs edges (classic player look)
        const src =
          i < half
            ? bins[half - 1 - i] || 0
            : bins[i - half] || 0;
        const shaped = Math.pow(src, 0.8);
        const target =
          Math.max(2, shaped * h * 0.9) * (playingRef.current ? 1 : 0.2);
        const prev = smooth[i] || 0;
        smooth[i] = target > prev ? prev * 0.4 + target * 0.6 : prev * 0.78 + target * 0.22;
        const barH = smooth[i]!;

        const x = i * (barW + gap);
        const bw = Math.max(1, barW * 0.78);
        const ox = x + (barW - bw) / 2;

        const g = ctx.createLinearGradient(ox, midY - barH / 2, ox, midY + barH / 2);
        g.addColorStop(0, 'rgba(167, 243, 208, 0.9)');
        g.addColorStop(0.5, 'rgba(52, 211, 153, 0.75)');
        g.addColorStop(1, 'rgba(5, 150, 105, 0.15)');
        ctx.fillStyle = g;
        // Rounded rect approximation
        const r = Math.min(bw / 2, 2);
        const top = midY - barH / 2;
        ctx.beginPath();
        ctx.moveTo(ox + r, top);
        ctx.lineTo(ox + bw - r, top);
        ctx.quadraticCurveTo(ox + bw, top, ox + bw, top + r);
        ctx.lineTo(ox + bw, top + barH - r);
        ctx.quadraticCurveTo(ox + bw, top + barH, ox + bw - r, top + barH);
        ctx.lineTo(ox + r, top + barH);
        ctx.quadraticCurveTo(ox, top + barH, ox, top + barH - r);
        ctx.lineTo(ox, top + r);
        ctx.quadraticCurveTo(ox, top, ox + r, top);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
      void ts;
    };

    const draw = (ts: number) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(draw);
      if (ts - lastFrame < minFrameMs) return;
      lastFrame = ts;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const analyser = ensureAnalyser();
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
        sampleLogBins(freqData, barCount, bins);
      } else {
        // Idle shimmer
        for (let i = 0; i < barCount; i++) {
          bins[i] = 0.08 + 0.06 * Math.sin(ts / 500 + i * 0.4);
        }
      }

      if (variant === 'hero') drawHero(ts, width, height);
      else drawInline(ts, width, height);
    };

    const ro = new ResizeObserver(() => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(parent.clientWidth * dpr);
      canvas.height = Math.floor(parent.clientHeight * dpr);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
    });
    ro.observe(canvas.parentElement || canvas);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [ensureAnalyser, variant]);

  return (
    <div
      className={cn(
        'w-full overflow-hidden',
        variant === 'hero'
          ? 'h-full rounded-2xl bg-zinc-950/80 ring-1 ring-white/8'
          : 'h-16 sm:h-[4.5rem] rounded-xl bg-black/25 ring-1 ring-white/5',
        className,
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
