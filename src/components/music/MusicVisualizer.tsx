/**
 * Lightweight canvas spectrum — MusicPlayerContext analyser / single <audio>.
 * variant: "inline" (under art) | "hero" (replaces album art).
 */
import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { cn } from '../../lib/cn';

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
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    let alive = true;
    const bins = variant === 'hero' ? 72 : 56;
    const data = new Uint8Array(256);
    const smooth = new Float32Array(bins);
    let lastFrame = 0;
    const minFrameMs = 1000 / 36;

    const draw = (ts: number) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(draw);
      if (ts - lastFrame < minFrameMs) return;
      lastFrame = ts;

      const { width, height } = canvas;
      ctx2d.clearRect(0, 0, width, height);

      // Soft vignette for hero mode
      if (variant === 'hero') {
        const vg = ctx2d.createRadialGradient(
          width / 2,
          height / 2,
          height * 0.1,
          width / 2,
          height / 2,
          height * 0.7,
        );
        vg.addColorStop(0, 'rgba(16, 185, 129, 0.06)');
        vg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx2d.fillStyle = vg;
        ctx2d.fillRect(0, 0, width, height);
      }

      const analyser = ensureAnalyser();
      const midY = height * (variant === 'hero' ? 0.52 : 0.55);
      const n = bins;
      const gap = Math.max(1.5, width * 0.0035);
      const barW = (width - gap * (n - 1)) / n;

      if (!analyser) {
        for (let i = 0; i < n; i++) {
          const h = 4 + Math.sin(ts / 480 + i * 0.32) * 3;
          smooth[i] = h;
          ctx2d.fillStyle = 'rgba(52, 211, 153, 0.22)';
          const bw = Math.max(1, barW * 0.82);
          const ox = i * (barW + gap) + (barW - bw) / 2;
          ctx2d.fillRect(ox, midY - h / 2, bw, h);
        }
        return;
      }

      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / n));
      const boost = playingRef.current ? 1 : 0.2;

      for (let i = 0; i < n; i++) {
        const idx = Math.min(data.length - 1, Math.floor(i * step * 0.82) + 3);
        const raw = (data[idx] || 0) / 255;
        const shaped = Math.pow(raw, 0.82) * boost;
        const target = Math.max(2, shaped * height * (variant === 'hero' ? 0.78 : 0.85));
        smooth[i] = smooth[i]! * 0.6 + target * 0.4;
        const h = smooth[i]!;

        const x = i * (barW + gap);
        const bw = Math.max(1, barW * 0.82);
        const ox = x + (barW - bw) / 2;

        const g = ctx2d.createLinearGradient(ox, midY - h / 2, ox, midY + h / 2);
        g.addColorStop(0, 'rgba(167, 243, 208, 0.95)');
        g.addColorStop(0.4, 'rgba(52, 211, 153, 0.8)');
        g.addColorStop(1, 'rgba(5, 150, 105, 0.12)');
        ctx2d.fillStyle = g;
        ctx2d.fillRect(ox, midY - h / 2, bw, h);
      }

      ctx2d.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx2d.beginPath();
      ctx2d.moveTo(0, midY);
      ctx2d.lineTo(width, midY);
      ctx2d.stroke();
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
          ? 'h-full rounded-2xl bg-black/40 ring-1 ring-white/8'
          : 'h-16 sm:h-[4.5rem] rounded-xl bg-black/25 ring-1 ring-white/5',
        className,
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
