/**
 * Dashboard weather card — gradient hero + 5-day strip + one-line tip.
 * Data comes from Open-Meteo via getWeather(); icons are inline SVG.
 */

import { RefreshCw } from 'lucide-react';
import {
  weatherCodeMeta,
  weatherCodeToCondition,
  weatherDayTip,
  weekdayShort,
  type WeatherCondition,
  type WeatherSnapshot,
} from '../lib/weather';
import { cn } from '../lib/cn';

const CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  rain: 'Rainy',
  storm: 'Stormy',
  snow: 'Snowy',
  fog: 'Foggy',
};

const CONDITION_GRADIENT: Record<WeatherCondition, string> = {
  clear: 'from-sky-400 via-sky-500 to-indigo-500',
  'partly-cloudy': 'from-sky-400 via-cyan-500 to-blue-500',
  cloudy: 'from-slate-400 via-slate-500 to-slate-600',
  rain: 'from-sky-500 via-blue-600 to-indigo-700',
  storm: 'from-slate-600 via-indigo-800 to-slate-900',
  snow: 'from-sky-300 via-cyan-300 to-blue-400',
  fog: 'from-slate-300 via-slate-400 to-slate-500',
};

function WeatherIcon({
  condition,
  className,
}: {
  condition: WeatherCondition;
  className?: string;
}) {
  const common = {
    className,
    viewBox: '0 0 64 64',
    fill: 'none' as const,
    'aria-hidden': true as const,
  };

  switch (condition) {
    case 'clear':
      return (
        <svg {...common}>
          <g className="origin-center [animation:wc-spin_18s_linear_infinite]">
            {Array.from({ length: 8 }).map((_, i) => (
              <line
                key={i}
                x1="32"
                y1="6"
                x2="32"
                y2="14"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                transform={`rotate(${i * 45} 32 32)`}
              />
            ))}
          </g>
          <circle cx="32" cy="32" r="12" fill="currentColor" />
        </svg>
      );
    case 'partly-cloudy':
      return (
        <svg {...common}>
          <g className="origin-center [animation:wc-spin_18s_linear_infinite]">
            {Array.from({ length: 8 }).map((_, i) => (
              <line
                key={i}
                x1="24"
                y1="8"
                x2="24"
                y2="14"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                transform={`rotate(${i * 45} 24 22)`}
              />
            ))}
          </g>
          <circle cx="24" cy="22" r="9" fill="currentColor" />
          <g className="[animation:wc-drift_5s_ease-in-out_infinite]">
            <path
              d="M22 44a9 9 0 0 1 9-9 10 10 0 0 1 19 3 7 7 0 0 1-2 14H29a7 7 0 0 1-7-8Z"
              fill="currentColor"
              opacity="0.9"
            />
          </g>
        </svg>
      );
    case 'cloudy':
      return (
        <svg {...common}>
          <g className="[animation:wc-drift_5s_ease-in-out_infinite]">
            <path
              d="M18 42a10 10 0 0 1 10-10 11 11 0 0 1 21 3 8 8 0 0 1-2 15H26a8 8 0 0 1-8-8Z"
              fill="currentColor"
            />
          </g>
        </svg>
      );
    case 'rain':
      return (
        <svg {...common}>
          <path
            d="M18 34a10 10 0 0 1 10-10 11 11 0 0 1 21 3 8 8 0 0 1-2 15H26a8 8 0 0 1-8-8Z"
            fill="currentColor"
          />
          {[24, 34, 44].map((x, i) => (
            <line
              key={x}
              x1={x}
              y1="46"
              x2={x - 3}
              y2="56"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="[animation:wc-rain_1.1s_ease-in_infinite]"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </svg>
      );
    case 'storm':
      return (
        <svg {...common}>
          <path
            d="M18 32a10 10 0 0 1 10-10 11 11 0 0 1 21 3 8 8 0 0 1-2 15H26a8 8 0 0 1-8-8Z"
            fill="currentColor"
          />
          <polygon
            points="34,42 26,54 32,54 28,62 42,48 35,48 39,42"
            fill="#fbbf24"
            className="[animation:wc-flash_2.2s_steps(1)_infinite]"
          />
        </svg>
      );
    case 'snow':
      return (
        <svg {...common}>
          <path
            d="M18 34a10 10 0 0 1 10-10 11 11 0 0 1 21 3 8 8 0 0 1-2 15H26a8 8 0 0 1-8-8Z"
            fill="currentColor"
          />
          {[24, 34, 44].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy="50"
              r="2.5"
              fill="currentColor"
              className="[animation:wc-snow_2s_ease-in_infinite]"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </svg>
      );
    case 'fog':
      return (
        <svg {...common}>
          <circle cx="26" cy="24" r="8" fill="currentColor" opacity="0.7" />
          {[38, 44, 50].map((y, i) => (
            <line
              key={y}
              x1="14"
              y1={y}
              x2="50"
              y2={y}
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="[animation:wc-drift_4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 0.25}s` }}
            />
          ))}
        </svg>
      );
  }
}

export function WeatherCard({
  snap,
  tip,
  loading,
  error,
  onRefresh,
  className,
}: {
  snap: WeatherSnapshot | null;
  tip?: string | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}) {
  const deg = (n: number) => `${Math.round(n)}°`;

  if (!snap) {
    return (
      <div
        className={cn(
          'hq-no-chrome-pad overflow-hidden rounded-[var(--app-radius,1rem)] border border-border bg-elevated text-fg shadow-[var(--app-shadow-card)] h-full flex flex-col',
          className,
        )}
      >
        <div className="p-5 space-y-2 flex-1">
          <p className="text-sm font-medium text-muted">Weather</p>
          {error ? (
            <p className="text-sm text-warn">{error}</p>
          ) : (
            <p className="text-sm text-muted">Loading today&apos;s forecast…</p>
          )}
        </div>
      </div>
    );
  }

  const condition = weatherCodeToCondition(snap.current.weatherCode);
  const meta = weatherCodeMeta(snap.current.weatherCode);
  const days = (snap.days?.length ? snap.days : [snap.today]).slice(0, 5);
  const tipText = tip ?? weatherDayTip(snap.hourly || []);

  return (
    <section
      aria-label={`Weather for ${snap.current.label}`}
      className={cn(
        'hq-no-chrome-pad overflow-hidden rounded-[var(--app-radius,1rem)] border border-border bg-elevated text-fg shadow-[var(--app-shadow-card)] h-full flex flex-col',
        className,
      )}
    >
      <style>{`
        @keyframes wc-spin { to { transform: rotate(360deg); } }
        @keyframes wc-drift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
        @keyframes wc-rain { 0% { opacity: 0; transform: translateY(-4px); } 40% { opacity: 1; } 100% { opacity: 0; transform: translateY(6px); } }
        @keyframes wc-snow { 0% { opacity: 0; transform: translateY(-4px); } 40% { opacity: 1; } 100% { opacity: 0.2; transform: translateY(8px); } }
        @keyframes wc-flash { 0%,92%,100% { opacity: 1; } 94%,98% { opacity: 0.2; } }
        @media (prefers-reduced-motion: reduce) {
          section [class*="animation"] { animation: none !important; }
        }
      `}</style>

      {/* Hero */}
      <div
        className={cn(
          'relative bg-gradient-to-br p-5 text-white',
          CONDITION_GRADIENT[condition],
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white/85 truncate">
                {snap.current.label}
              </p>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/15 shrink-0"
                  title="Refresh weather"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                </button>
              )}
            </div>
            <div className="mt-1 flex items-start">
              <span className="text-5xl sm:text-6xl font-black leading-none tabular-nums tracking-tight">
                {deg(snap.current.tempC)}
              </span>
              <span className="mt-1 ml-0.5 text-base font-semibold text-white/80">C</span>
            </div>
            <p className="mt-2 text-sm font-medium text-white/95">
              {meta.label}
              {CONDITION_LABEL[condition] !== meta.label
                ? ` · ${CONDITION_LABEL[condition]}`
                : ''}
            </p>
            <p className="mt-1 text-xs font-medium text-white/75 tabular-nums">
              H:{deg(snap.today.tempMaxC)} L:{deg(snap.today.tempMinC)}
            </p>
          </div>
          <WeatherIcon
            condition={condition}
            className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 text-white drop-shadow"
          />
        </div>

        {tipText && (
          <p className="mt-3 text-sm font-semibold leading-snug rounded-xl bg-black/25 backdrop-blur-sm px-3 py-2 text-white">
            {tipText}
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs text-amber-200">{error}</p>
        )}
      </div>

      {/* 5-day */}
      <ul className="grid grid-cols-5 divide-x divide-border bg-elevated">
        {days.map((d, i) => {
          const c = weatherCodeToCondition(d.weatherCode);
          return (
            <li
              key={`${d.date}-${i}`}
              className="flex flex-col items-center gap-1 px-0.5 py-3 text-center"
            >
              <span className="text-[10px] sm:text-xs font-bold text-muted">
                {i === 0 ? 'Today' : weekdayShort(d.date)}
              </span>
              <WeatherIcon condition={c} className="h-7 w-7 text-fg" />
              {typeof d.precipProb === 'number' && d.precipProb > 0 ? (
                <span className="text-[10px] font-semibold text-sky-500 tabular-nums">
                  {Math.round(d.precipProb)}%
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-transparent tabular-nums">0%</span>
              )}
              <span className="text-xs sm:text-sm font-bold tabular-nums text-fg">
                {deg(d.tempMaxC)}
              </span>
              <span className="text-[10px] sm:text-xs text-muted tabular-nums">
                {deg(d.tempMinC)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
