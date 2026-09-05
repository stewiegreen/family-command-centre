import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  getWeather,
  weatherCodeMeta,
  type WeatherSnapshot,
  type WeatherLocation,
} from '../lib/weather';
import { cn } from '../lib/cn';

export function WeatherHeaderChip({ className }: { className?: string }) {
  const { data } = useApp();
  const settingsLoc = data.settings.weather as WeatherLocation | undefined;
  const [snap, setSnap] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getWeather(settingsLoc)
      .then((s) => {
        if (!cancelled) setSnap(s);
      })
      .catch(() => {
        /* silent in header */
      });
    return () => {
      cancelled = true;
    };
  }, [settingsLoc?.latitude, settingsLoc?.longitude, settingsLoc?.label]);

  if (!snap) {
    return (
      <div
        className={cn(
          'hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-muted tabular-nums',
          className,
        )}
        title="Loading weather…"
      >
        <span className="opacity-50">…</span>
      </div>
    );
  }

  const meta = weatherCodeMeta(snap.current.weatherCode);
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm text-fg bg-surface-2/60 border border-border/60 max-w-[10rem] sm:max-w-none',
        className,
      )}
      title={`${meta.label} · ${snap.current.label}`}
    >
      <span className="text-base leading-none" aria-hidden>
        {meta.emoji}
      </span>
      <span className="font-semibold tabular-nums">{snap.current.tempC}°</span>
      <span className="text-xs text-muted truncate hidden md:inline">{meta.label}</span>
    </div>
  );
}
