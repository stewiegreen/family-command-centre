/**
 * GreenHQ media card — visual language matched to Comics CoverFrame / BookCard.
 * Artwork is primary; captions stay short; no Emby chrome.
 * Music albums are always square; episodes / Continue Watching are landscape.
 */
import { Check, Film, Play } from 'lucide-react';
import {
  displayTitle,
  embyEpisodeArtUrl,
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
  variant?: MediaCardVariant;
  className?: string;
};

const COVER_POSTER = 'w-[9.5rem] sm:w-[10.75rem]';
const COVER_SQUARE = 'w-[9.5rem] sm:w-[10.75rem]';
const COVER_LANDSCAPE = 'w-[16.5rem] sm:w-[19.5rem]';

function isMusicAlbum(item: EmbyItem): boolean {
  const t = item.Type || '';
  return t === 'MusicAlbum' || t === 'Album';
}

function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  if (pct <= 0 || pct >= 100) return null;
  return (
    <div className={cn('h-1.5 rounded-full bg-black/45 overflow-hidden', className)}>
      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

function episodeCode(item: EmbyItem): string | null {
  if (item.Type !== 'Episode') return null;
  const s = item.ParentIndexNumber != null ? `S${item.ParentIndexNumber}` : null;
  const e = item.IndexNumber != null ? `E${item.IndexNumber}` : null;
  if (s && e) return `${s} · ${e}`;
  return s || e;
}

function primaryTitle(item: EmbyItem, landscape: boolean): string {
  if (landscape && item.Type === 'Episode' && item.SeriesName) return item.SeriesName;
  if (item.Type === 'Episode' && item.SeriesName) return item.SeriesName;
  return item.Name || 'Untitled';
}

function secondaryLine(item: EmbyItem, landscape: boolean): string | null {
  const pct = playedPercent(item);
  if (landscape) {
    if (item.Type === 'Episode') {
      const code = episodeCode(item);
      return [code, item.Name].filter(Boolean).join(' · ') || null;
    }
    const left = remainingLabel(item);
    if (left) return left;
    if (pct > 0 && pct < 100) return `${Math.round(pct)}% watched`;
    return item.ProductionYear ? String(item.ProductionYear) : null;
  }
  if (isMusicAlbum(item)) {
    // AlbumArtist is common on Emby albums; fall back to year
    const artist =
      (item as EmbyItem & { AlbumArtist?: string }).AlbumArtist ||
      (item as EmbyItem & { Artists?: string[] }).Artists?.[0];
    if (artist) return artist;
    return item.ProductionYear ? String(item.ProductionYear) : 'Album';
  }
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
    return episodeCode(item) || item.SeriesName || 'Episode';
  }
  if (item.Type === 'Season') {
    return item.IndexNumber != null ? `Season ${item.IndexNumber}` : 'Season';
  }
  return item.ProductionYear ? String(item.ProductionYear) : item.Type || null;
}

function CoverFrame({
  src,
  shape,
  footer,
  badge,
}: {
  src: string;
  shape: 'poster' | 'landscape' | 'square';
  footer?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-surface-2 border border-border shadow-md',
        'rounded-2xl',
        shape === 'landscape' && 'aspect-video',
        shape === 'square' && 'aspect-square',
        shape === 'poster' && 'aspect-[2/3]',
      )}
      style={{ boxShadow: 'var(--app-shadow-card)' }}
    >
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-muted pointer-events-none -z-10">
        <Film className="w-8 h-8 opacity-30" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
        <span className="rounded-full bg-accent text-accent-ink p-2.5 shadow-lg">
          <Play className={cn('fill-current', shape === 'landscape' ? 'w-5 h-5' : 'w-4 h-4')} />
        </span>
      </div>
      {footer}
      {badge}
    </div>
  );
}

export function MediaCard({ item, onOpen, variant = 'poster', className }: Props) {
  const pct = playedPercent(item);
  const isEpisode = item.Type === 'Episode';
  const album = isMusicAlbum(item);
  // Albums stay square even if someone opens them from a continue-style row
  const landscape = !album && (variant === 'continue' || isEpisode);
  const shape: 'poster' | 'landscape' | 'square' = album
    ? 'square'
    : landscape
      ? 'landscape'
      : 'poster';
  const title = primaryTitle(item, landscape);
  const sub = secondaryLine(item, landscape);
  const left = landscape ? remainingLabel(item) : null;
  const img = isEpisode
    ? embyEpisodeArtUrl(item, 720)
    : landscape
      ? embyThumbUrl(item, 720)
      : embyPosterUrl(item, 400);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={displayTitle(item)}
      className={cn(
        'shrink-0 text-left group',
        shape === 'landscape' ? COVER_LANDSCAPE : shape === 'square' ? COVER_SQUARE : COVER_POSTER,
        className,
      )}
    >
      <CoverFrame
        src={img}
        shape={shape}
        footer={
          landscape && pct > 0 && pct < 100 ? (
            <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent space-y-1">
              <ProgressBar pct={pct} />
              {left ? (
                <p className="text-[10px] font-semibold text-white/90 tabular-nums">{left}</p>
              ) : null}
            </div>
          ) : !landscape && pct > 0 && pct < 100 ? (
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
              <ProgressBar pct={pct} />
            </div>
          ) : undefined
        }
        badge={
          item.UserData?.Played && !landscape ? (
            <div className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white p-1 shadow">
              <Check className="w-3.5 h-3.5" />
            </div>
          ) : undefined
        }
      />
      <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">{title}</p>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        {sub ? <p className="text-[11px] text-muted line-clamp-1 min-w-0">{sub}</p> : <span />}
        {landscape && pct > 0 && pct < 100 ? (
          <span className="text-[11px] font-semibold text-accent shrink-0">CONTINUE</span>
        ) : null}
      </div>
    </button>
  );
}
