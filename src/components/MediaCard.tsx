import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
/**
 * GreenHQ media card — visual language matched to Comics CoverFrame / BookCard.
 * Artwork is primary; captions stay short; no Emby chrome.
 * Music albums are always square; episodes / Continue Watching are landscape.
 */
import { Check, Film, Info, Play } from 'lucide-react';
import {
  displayTitle,
  embyBestLogoUrl,
  embyEpisodeArtUrl,
  embyPosterUrl,
  embyThumbUrl,
  playedPercent,
  remainingLabel,
  runtimeLabel,
  embyItem,
  type EmbyItem,
} from '../lib/emby';
import { cn } from '../lib/cn';

export type MediaCardVariant = 'poster' | 'continue';

type Props = {
  item: EmbyItem;
  onOpen: () => void;
  /** When set, hover/long-press expands the card in-rail with Play. */
  onPlay?: () => void;
  variant?: MediaCardVariant;
  square?: boolean;
  layout?: 'scroll' | 'grid';
  className?: string;
  /**
   * Enable Netflix-style expand-to-the-right preview (default true when onPlay is set).
   * Collapses automatically when the pointer leaves the expanded card.
   */
  expandable?: boolean;
  /** Emby user id — used to prefetch Overview when the card expands. */
  embyUserId?: string;
};

const COVER_POSTER = 'w-[9.5rem] sm:w-[10.75rem]';
const COVER_SQUARE = 'w-[9.5rem] sm:w-[10.75rem]';
const COVER_LANDSCAPE = 'w-[16.5rem] sm:w-[19.5rem]';

function isMusicAlbum(item: EmbyItem): boolean {
  const t = item.Type || '';
  // Emby often returns album folders as Type "Folder" under a music library / artist.
  return t === 'MusicAlbum' || t === 'Album' || t === 'MusicArtist';
}

function isSquareItem(item: EmbyItem, forceSquare?: boolean): boolean {
  if (forceSquare) return true;
  if (isMusicAlbum(item)) return true;
  const t = (item.Type || '').toLowerCase();
  if (t === 'musicalbum' || t === 'album') return true;
  // Some servers tag audio containers this way
  const extra = item as EmbyItem & { MediaType?: string; IsFolder?: boolean };
  const mt = String(extra.MediaType || '').toLowerCase();
  if (mt === 'audio' && (item.Type === 'Folder' || extra.IsFolder)) return true;
  return false;
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
  // Don't surface raw "Folder" under titles — year or nothing
  if (item.Type === 'Folder' || (item as EmbyItem & { IsFolder?: boolean }).IsFolder) {
    return item.ProductionYear ? String(item.ProductionYear) : null;
  }
  return item.ProductionYear ? String(item.ProductionYear) : item.Type || null;
}

function CoverFrame({
  src,
  shape,
  footer,
  badge,
  className,
  fillHeight,
}: {
  src: string;
  shape: 'poster' | 'landscape' | 'square';
  footer?: ReactNode;
  badge?: ReactNode;
  className?: string;
  /** Stretch to parent height (expanded card) — no aspect box. */
  fillHeight?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-surface-2 border border-border shadow-md',
        'rounded-2xl',
        !fillHeight && shape === 'landscape' && 'aspect-video',
        !fillHeight && shape === 'square' && 'aspect-square',
        !fillHeight && shape === 'poster' && 'aspect-[2/3]',
        fillHeight && 'h-full min-h-0',
        className,
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


export function MediaCard({
  item,
  onOpen,
  onPlay,
  variant = 'poster',
  square: forceSquare,
  layout = 'scroll',
  className,
  expandable: expandableProp,
  embyUserId,
}: Props) {
  const expandable = expandableProp ?? Boolean(onPlay);
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState<EmbyItem | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const clearHover = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const collapse = useCallback(() => {
    clearHover();
    setExpanded(false);
  }, [clearHover]);

  const expand = useCallback(() => {
    setExpanded(true);
  }, []);

  // Prefetch full item (overview) when expanded
  useEffect(() => {
    if (!expanded) {
      setFull(null);
      setLogoFailed(false);
      return;
    }
    setLogoFailed(false);
    setFull(item);
    if (!embyUserId || item.Overview) return;
    let cancelled = false;
    void embyItem(embyUserId, item.Id)
      .then((detail) => {
        if (!cancelled) setFull(detail);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [expanded, item, embyUserId]);

  const pct = playedPercent(item);
  const isEpisode =
    item.Type === 'Episode' ||
    (item.Type !== 'Series' &&
      item.Type !== 'Season' &&
      item.Type !== 'Movie' &&
      item.Type !== 'Folder' &&
      item.Type !== 'BoxSet' &&
      !!item.SeriesName &&
      item.IndexNumber != null);
  const album = !isEpisode && isSquareItem(item, forceSquare);
  const landscape = isEpisode || (!album && variant === 'continue');
  const shape: 'poster' | 'landscape' | 'square' = isEpisode
    ? 'landscape'
    : album
      ? 'square'
      : landscape
        ? 'landscape'
        : 'poster';
  const title = primaryTitle(item, landscape);
  const sub = secondaryLine(item, landscape);
  const left = remainingLabel(item);
  const runtime = runtimeLabel(full || item);
  const overview = ((full || item).Overview || '').trim();
  const img = isEpisode
    ? embyEpisodeArtUrl(item, 720)
    : landscape
      ? embyThumbUrl(item, 720)
      : embyPosterUrl(item, 400);
  /** Collapsed caption logo (series/season under poster). */
  const seriesLogo =
    !landscape && (item.Type === 'Series' || item.Type === 'Season')
      ? embyBestLogoUrl(item, 64)
      : null;
  /** Expanded panel title logo — any title with an Emby Logo image. */
  const titleLogo = embyBestLogoUrl(full || item, 220);
  const showTitleLogo = Boolean(titleLogo) && !logoFailed;

  const canFineHover =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const startHoverExpand = () => {
    if (!expandable || !canFineHover) return;
    clearHover();
    hoverTimer.current = setTimeout(() => expand(), 700);
  };

  const startLongPress = () => {
    if (!expandable) return;
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      expand();
    }, 500);
  };

  // Touch: collapse when tapping outside
  useEffect(() => {
    if (!expanded) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) collapse();
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [expanded, collapse]);

  const coverW =
    shape === 'landscape' ? COVER_LANDSCAPE : shape === 'square' ? COVER_SQUARE : COVER_POSTER;

  return (
    <div
      ref={rootRef}
      onPointerEnter={startHoverExpand}
      onPointerLeave={() => {
        clearHover();
        clearLongPress();
        if (canFineHover) collapse();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch' || e.pointerType === 'pen') startLongPress();
      }}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      className={cn(
        'relative text-left group transition-[width,box-shadow] duration-300 ease-out',
        layout === 'grid' ? 'w-full min-w-0' : 'shrink-0',
        layout === 'scroll' && !expanded && coverW,
        expanded && layout === 'scroll' && 'z-20',
        expanded &&
          (shape === 'landscape'
            ? 'w-[min(100%,36rem)] sm:w-[42rem] md:w-[48rem]'
            : 'w-[min(100%,32rem)] sm:w-[40rem] md:w-[46rem]'),
        expanded &&
          'rounded-2xl bg-surface-1 border border-border shadow-xl shadow-black/25 ring-1 ring-black/5 overflow-hidden self-start',
        className,
      )}
    >
      <div
        className={cn(
          expanded ? 'grid grid-cols-[auto_1fr] grid-rows-1 items-stretch' : 'flex flex-col',
        )}
      >
        {/* Art — click opens detail unless long-press just fired.
            When expanded, a hidden aspect sizer locks row height to the poster;
            the visible frame fills that height so no gap under the art. */}
        <button
          type="button"
          onClick={() => {
            if (longPressFired.current) {
              longPressFired.current = false;
              return;
            }
            onOpen();
          }}
          aria-label={displayTitle(item)}
          className={cn(
            'text-left shrink-0 relative',
            expanded
              ? shape === 'landscape'
                ? 'w-[14rem] sm:w-[16rem] md:w-[17.5rem]'
                : shape === 'square'
                  ? 'w-[10.75rem] sm:w-[12rem]'
                  : 'w-[10.75rem] sm:w-[12rem] md:w-[13rem]'
              : 'w-full',
          )}
        >
          {expanded ? (
            <div
              className={cn(
                'invisible pointer-events-none w-full',
                shape === 'landscape' && 'aspect-video',
                shape === 'square' && 'aspect-square',
                shape === 'poster' && 'aspect-[2/3]',
              )}
              aria-hidden
            />
          ) : null}
          <CoverFrame
            src={img}
            shape={shape}
            fillHeight={expanded}
            className={
              expanded
                ? '!rounded-l-2xl !rounded-r-none !border-0 absolute inset-0 h-full w-full'
                : undefined
            }
            footer={
              !expanded && landscape && pct > 0 && pct < 100 ? (
                <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent space-y-1">
                  <ProgressBar pct={pct} />
                  {left ? (
                    <p className="text-[10px] font-semibold text-white/90 tabular-nums">{left}</p>
                  ) : null}
                </div>
              ) : !expanded && !landscape && pct > 0 && pct < 100 ? (
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                  <ProgressBar pct={pct} />
                </div>
              ) : undefined
            }
            badge={
              !expanded && item.UserData?.Played && !landscape ? (
                <div className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white p-1 shadow">
                  <Check className="w-3.5 h-3.5" />
                </div>
              ) : undefined
            }
          />
          {!expanded && (
            <>
              {seriesLogo ? (
                <div className="mt-2 h-9 flex items-center">
                  <img
                    src={seriesLogo}
                    alt={title}
                    className="max-h-9 max-w-full w-auto object-contain object-left drop-shadow-sm"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      const fallback = e.currentTarget.parentElement?.querySelector(
                        '[data-title-fallback]',
                      );
                      if (fallback instanceof HTMLElement) fallback.style.display = 'block';
                    }}
                  />
                  <p
                    data-title-fallback
                    className="text-sm font-semibold text-fg line-clamp-2 leading-snug"
                    style={{ display: 'none' }}
                  >
                    {title}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">{title}</p>
              )}
              <div className="mt-0.5 flex items-center justify-between gap-1">
                {sub ? <p className="text-[11px] text-muted line-clamp-1 min-w-0">{sub}</p> : <span />}
                {landscape && pct > 0 && pct < 100 ? (
                  <span className="text-[11px] font-semibold text-accent shrink-0">CONTINUE</span>
                ) : null}
              </div>
            </>
          )}
        </button>

        {/* Expanded detail panel — grows to the right */}
        <div
          className={cn(
            'overflow-hidden transition-[max-width,opacity] duration-300 ease-out min-h-0',
            expanded
              ? 'max-w-[28rem] sm:max-w-[32rem] md:max-w-[36rem] opacity-100 h-0 min-h-full'
              : 'max-w-0 opacity-0',
          )}
        >
          {expanded && (
            <div className="h-full max-h-full min-h-0 flex flex-col justify-between p-3 sm:p-4 overflow-hidden">
              <div className="min-w-0 min-h-0 flex-1 flex flex-col gap-1.5 overflow-hidden">
                {showTitleLogo ? (
                  <img
                    src={titleLogo!}
                    alt={displayTitle(item)}
                    className="max-h-10 sm:max-h-12 md:max-h-14 max-w-full w-auto object-contain object-left drop-shadow-sm shrink-0"
                    onError={() => setLogoFailed(true)}
                  />
                ) : (
                  <p className="text-base sm:text-lg md:text-xl font-bold text-fg leading-snug line-clamp-2 shrink-0">
                    {displayTitle(item)}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-muted shrink-0">
                  {item.ProductionYear ? <span>{item.ProductionYear}</span> : null}
                  {runtime ? (
                    <>
                      {item.ProductionYear ? <span>·</span> : null}
                      <span className="tabular-nums">{runtime}</span>
                    </>
                  ) : null}
                  {left && pct > 0 && pct < 100 ? (
                    <>
                      <span>·</span>
                      <span className="text-accent font-semibold tabular-nums">{left}</span>
                    </>
                  ) : null}
                  {item.OfficialRating ? (
                    <>
                      <span>·</span>
                      <span className="rounded border border-border px-1 py-px text-[10px] font-semibold">
                        {item.OfficialRating}
                      </span>
                    </>
                  ) : null}
                  {item.CommunityRating != null && item.CommunityRating > 0 ? (
                    <>
                      <span>·</span>
                      <span>★ {item.CommunityRating.toFixed(1)}</span>
                    </>
                  ) : null}
                </div>
                {pct > 0 && pct < 100 ? (
                  <div className="pt-0.5">
                    <ProgressBar pct={pct} className="!bg-inset" />
                    <p className="mt-0.5 text-[10px] text-muted tabular-nums">{Math.round(pct)}% watched</p>
                  </div>
                ) : null}
                {overview ? (
                  <p className="text-xs sm:text-sm text-fg-secondary leading-relaxed line-clamp-3 min-h-0 overflow-hidden">
                    {overview}
                  </p>
                ) : (
                  <p className="text-xs text-muted italic">No synopsis</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2 shrink-0">
                {onPlay ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay();
                      collapse();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-ink px-4 py-2 text-sm font-bold hover:bg-accent-hover"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {pct > 0 && pct < 100 ? 'Resume' : 'Play'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                    collapse();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-fg hover:bg-nav-hover"
                >
                  <Info className="w-4 h-4" />
                  More
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
