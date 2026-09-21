/**
 * Lightweight canvas spectrum — same MusicPlayerContext analyser / <audio>.
 * Mirrored bars + soft glow, capped raf when paused.
 */
import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { cn } from '../../lib/cn';

export function MusicVisualizer({ className }: { className?: string }) {
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
    const bins = 64;
    const data = new Uint8Array(bins * 2);
    // Smoothed heights to reduce flicker / CPU spikes
    const smooth = new Float32Array(bins);
    let lastFrame = 0;
    const minFrameMs = 1000 / 36; // ~36fps cap

    const draw = (ts: number) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(draw);
      if (ts - lastFrame < minFrameMs) return;
      lastFrame = ts;

      const { width, height } = canvas;
      ctx2d.clearRect(0, 0, width, height);

      const analyser = ensureAnalyser();
      const midY = height * 0.55;
      const n = bins;
      const gap = Math.max(1, width * 0.004);
      const barW = (width - gap * (n - 1)) / n;

      if (!analyser) {
        for (let i = 0; i < n; i++) {
          const h = 3 + Math.sin(ts / 500 + i * 0.35) * 2.5;
          smooth[i] = h;
          ctx2d.fillStyle = 'rgba(52, 211, 153, 0.2)';
          ctx2d.fillRect(i * (barW + gap), midY - h / 2, barW, h);
        }
        return;
      }

      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / n));
      const boost = playingRef.current ? 1 : 0.22;

      for (let i = 0; i < n; i++) {
        // Weight lower-mid frequencies a bit more (musical)
        const idx = Math.min(data.length - 1, Math.floor(i * step * 0.85) + 2);
        const raw = (data[idx] || 0) / 255;
        const shaped = Math.pow(raw, 0.85) * boost;
        const target = Math.max(2, shaped * height * 0.85);
        smooth[i] = smooth[i] * 0.62 + target * 0.38;
        const h = smooth[i]!;

        const x = i * (barW + gap);
        const g = ctx2d.createLinearGradient(x, midY - h / 2, x, midY + h / 2);
        g.addColorStop(0, 'rgba(167, 243, 208, 0.9)');
        g.addColorStop(0.45, 'rgba(52, 211, 153, 0.75)');
        g.addColorStop(1, 'rgba(16, 185, 129, 0.15)');
        ctx2d.fillStyle = g;
        // Rounded-ish bars via slight inset
        const bw = Math.max(1, barW * 0.85);
        const ox = x + (barW - bw) / 2;
        ctx2d.fillRect(ox, midY - h / 2, bw, h);
      }

      // Soft center glow line
      ctx2d.strokeStyle = 'rgba(255,255,255,0.06)';
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
  }, [ensureAnalyser]);

  return (
    <div
      className={cn(
        'w-full h-16 sm:h-[4.5rem] rounded-xl overflow-hidden',
        'bg-black/25 ring-1 ring-white/5',
        className,
      )}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
