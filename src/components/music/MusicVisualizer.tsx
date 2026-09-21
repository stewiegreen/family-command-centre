/**
 * Lightweight canvas spectrum visualizer — uses MusicPlayerContext analyser.
 */
import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { cn } from '../../lib/cn';

export function MusicVisualizer({ className }: { className?: string }) {
  const { isPlaying, ensureAnalyser } = useMusicPlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    let alive = true;
    const data = new Uint8Array(128);

    const draw = () => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(draw);
      const analyser = ensureAnalyser();
      const { width, height } = canvas;
      ctx2d.clearRect(0, 0, width, height);

      if (!analyser) {
        // Idle bars
        const n = 32;
        const gap = 2;
        const barW = (width - gap * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
          const h = 4 + Math.sin(Date.now() / 400 + i * 0.4) * 3;
          ctx2d.fillStyle = 'rgba(52, 211, 153, 0.25)';
          ctx2d.fillRect(i * (barW + gap), height - h, barW, h);
        }
        return;
      }

      analyser.getByteFrequencyData(data);
      const n = 48;
      const step = Math.floor(data.length / n);
      const gap = 2;
      const barW = (width - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const v = data[i * step] || 0;
        const h = Math.max(2, (v / 255) * height * (isPlaying ? 0.92 : 0.35));
        const g = ctx2d.createLinearGradient(0, height - h, 0, height);
        g.addColorStop(0, 'rgba(110, 231, 183, 0.95)');
        g.addColorStop(1, 'rgba(16, 185, 129, 0.35)');
        ctx2d.fillStyle = g;
        ctx2d.fillRect(i * (barW + gap), height - h, barW, h);
      }
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
    draw();

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [ensureAnalyser, isPlaying]);

  return (
    <div className={cn('w-full h-14 sm:h-16 rounded-lg overflow-hidden bg-black/30', className)}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
