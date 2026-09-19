/**
 * Shared GreenHQ media card — same design language as Comics CoverFrame/BookCard.
 * Artwork geometry changes by variant; metadata adapts by Emby item type.
 */
import { Film, Play } from 'lucide-react';
import {
  displayTitle,
  embyPosterUrl,
  embyThumbUrl,
  playedPercent,
  remainingLabel,
  type EmbyItem,
} from '../lib/emby';
import { cn } from '../lib/cn';

export type MediaCardVariant = 'poster' | 'continue';

type Props = {
  item: EmbyItem;
  onOpen: () => void;
  /** poster = Latest/browse; continue = landscape Continue Watching */
  variant?: MediaCardVariant;
  className?: string;
};

function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  if (pct <= 0 || pct >= 100) return null;
  return (
    <div className={cn('h-1.5 rounded-full bg-black/40 overflow-hidden', className)}>
      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function episodeCode(item: EmbyItem): string | null {
  if (item.Type !== 'Episode') return null;
  const s = item.ParentIndexNumber != null ? `S${item.ParentIndexNumber}` : null;
  const e = item.IndexNumber != null ? `E${item.IndexNumber}` : null;
  if (s && e) return `${s} ${e}`;
  return s || e;
}

function primaryTitle(item: EmbyItem, variant: MediaCardVariant): string {
  if (variant === 'continue' && item.Type === 'Episode' && item.SeriesName) {
    return item.SeriesName;
  }
  if (item.Type === 'Episode' && item.SeriesName) {
    return item.SeriesName;
  }
  return item.Name || 'Untitled';
}

function secondaryLine(item: EmbyItem, variant: MediaCardVariant): string | null {
  const pct = playedPercent(item);

  if (variant === 'continue') {
    if (item.Type === 'Episode') {
      const code = episodeCode(item);
      const parts = [code, item.Name].filter(Boolean);
      return parts.join(' · ') || null;
    }
    const left = remainingLabel(item);
    if (left) return left;
    if (pct > 0 && pct < 100) return `${Math.round(pct)}% watched`;
    return item.ProductionYear ? String(item.ProductionYear) : null;
  }

  // Poster variant — type-aware metadata
  if (item.Type === 'Series') {
    if (item.ChildCount && item.ChildCount > 0) {
      return `${item.ChildCount} ${item.ChildCount === 1 ? 'season' : 'seasons'}`;
    }
    if (item.UserData?.UnplayedItemCount) {
      return `${item.UserData.UnplayedItemCount} unwatched`;
    }
    return 'Series';
  }
  if (item.Type === 'Episode') {
    const code = episodeCode(item);
    return code || item.SeriesName || 'Episode';
  }
  if (item.Type === 'Movie' || !item.Type) {
    return item.ProductionYear ? String(item.ProductionYear) : runtimeFromItem(item);
  }
  if (item.Type === 'Audio' || item.Type === 'MusicAlbum') {
    return item.ProductionYear ? String(item.ProductionYear) : 'Music';
  }
  return item.ProductionYear ? String(item.ProductionYear) : item.Type || null;
}

function runtimeFromItem(item: EmbyItem): string | null {
  const ticks = item.RunTimeTicks;
  if (!ticks || ticks <= 0) return null;
  const mins = Math.round(ticks / 600_000_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * GreenHQ media tile.
 * - `poster`: 2:3 Primary art (Latest, browse, search)
 * - `continue`: 16:9 Thumb/Backdrop (Continue Watching) with progress + remaining
 */
export function MediaCard({ item, onOpen, variant = 'poster', className }: Props) {
  const pct = playedPercent(item);
  const isContinue = variant === 'continue';
  const title = primaryTitle(item, variant);
  const sub = secondaryLine(item, variant);
  const left = isContinue ? remainingLabel(item) : null;
  const img = isContinue ? embyThumbUrl(item, 640) : embyPosterUrl(item, 360);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={displayTitle(item)}
      className={cn(
        'shrink-0 text-left group',
        isContinue ? 'w-[17rem] sm:w-[20rem]' : 'w-[9.5rem] sm:w-[11rem]',
        className,
      )}
    >
      {/* Artwork frame — matches Comics CoverFrame chrome (theme tokens) */}
      <div
        className={cn(
          'relative overflow-hidden bg-surface-2 border border-border',
          '[border-radius:var(--app-card-radius,1rem)]',
          isContinue ? 'aspect-video shadow-md' : 'aspect-[2/3] shadow-md',
        )}
        style={{ boxShadow: 'var(--app-shadow-card)' }}
      >
        <img
          src={img}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = 'none';
          }}
        />
        {/* Fallback icon if image fails */}
        <div className="absolute inset-0 flex items-center justify-center text-muted pointer-events-none -z-10">
          <Film className="w-8 h-8 opacity-30" />
        </div>

        {/* Hover play */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <span className="rounded-full bg-accent text-accent-ink p-2.5 shadow-lg">
            <Play className={cn('fill-current', isContinue ? 'w-5 h-5' : 'w-4 h-4')} />
          </span>
        </div>

        {/* Continue: gradient + progress on art */}
        {isContinue && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 p-2.5 space-y-1">
              <ProgressBar pct={pct} />
              {left && (
                <p className="text-[10px] font-semibold text-white/85 tabular-nums">{left}</p>
              )}
            </div>
          </>
        )}

        {/* Poster: thin progress only when in-progress */}
        {!isContinue && pct > 0 && pct < 100 && (
          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/65 to-transparent">
            <ProgressBar pct={pct} />
          </div>
        )}

        {item.UserData?.Played && !isContinue && (
          <span className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 shadow">
            Watched
          </span>
        )}
      </div>

      {/* Caption — GreenHQ text hierarchy */}
      <div className={cn('mt-2', isContinue && 'px-0.5')}>
        <p className="text-sm font-semibold text-fg line-clamp-2 leading-snug">{title}</p>
        {sub && (
          <p className="text-[11px] text-muted mt-0.5 line-clamp-1">
            {isContinue && item.Type === 'Episode' ? sub : sub}
          </p>
        )}
        {isContinue && item.Type === 'Episode' && left && (
          <p className="text-[11px] text-accent font-medium mt-0.5">{left}</p>
        )}
      </div>
    </button>
  );
}
