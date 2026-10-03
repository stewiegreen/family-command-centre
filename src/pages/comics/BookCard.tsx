// src/pages/comics/BookCard.tsx
// Expandable / static book cover card for comics rails and grids.
// Expand/hover/long-press state is fully self-contained.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Info, Play } from 'lucide-react';
import {
  bookProgressPercent,
  bookTitle,
  komgaBook,
  komgaBookThumbUrl,
  type KomgaBook,
} from '../../lib/komga';
import { cn } from '../../lib/cn';
import { COVER_BOOK, COVER_SERIES, CoverFrame, ProgressBar, StatusPill } from './CoverChrome';

export function BookCard({
  book,
  memberId,
  onOpen,
  onResume,
  onOpenSeries,
  hero,
  expandable = false,
  /** Emphasize issue title over series (Recently added rail). */
  issueFirst = false,
}: {
  book: KomgaBook;
  memberId?: string;
  onOpen: () => void;
  onResume?: () => void;
  onOpenSeries?: () => void;
  hero?: boolean;
  expandable?: boolean;
  issueFirst?: boolean;
}) {
  const pct = bookProgressPercent(book);
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState<KomgaBook | null>(null);
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

  useEffect(() => {
    if (!expanded) {
      setFull(null);
      return;
    }
    setFull(book);
    if (book.metadata?.summary) return;
    let cancelled = false;
    void komgaBook(book.id, memberId)
      .then((detail) => {
        if (!cancelled && detail) setFull(detail);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [expanded, book, memberId]);

  useEffect(() => {
    if (!expanded) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) collapse();
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [expanded, collapse]);

  const canFineHover =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const startHoverExpand = () => {
    if (!expandable || !canFineHover) return;
    clearHover();
    hoverTimer.current = setTimeout(() => setExpanded(true), 700);
  };

  const startLongPress = () => {
    if (!expandable) return;
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setExpanded(true);
    }, 500);
  };

  const show = full || book;
  const summary = (show.metadata?.summary || '').trim();
  const series = book.seriesTitle || book.series?.name;
  const issue =
    book.number != null
      ? `#${book.number}${book.metadata?.title || book.name ? ` · ${book.metadata?.title || book.name}` : ''}`
      : book.metadata?.title || book.name || null;
  const page =
    typeof book.readProgress?.page === 'number' && book.readProgress.page > 0
      ? typeof book.media?.pagesCount === 'number'
        ? `Page ${book.readProgress.page} of ${book.media.pagesCount}`
        : `Page ${book.readProgress.page}`
      : book.media?.pagesCount
        ? `${book.media.pagesCount} pages`
        : null;

  /** Fixed rem widths so width can tween (%, max-w mixes cause overlap/jank). */
  const artW = hero ? 'w-[11rem] sm:w-[12rem]' : 'w-[9.5rem] sm:w-[10.75rem]';
  const panelW = 'w-[18rem] sm:w-[22rem] md:w-[24rem]';
  const expandedTotal = hero
    ? 'w-[min(100%,29rem)] sm:w-[34rem] md:w-[36rem]'
    : 'w-[min(100%,27.5rem)] sm:w-[32.75rem] md:w-[34.75rem]';

  if (!expandable) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn('shrink-0 text-left group', hero ? COVER_SERIES : COVER_BOOK)}
        aria-label={bookTitle(book)}
      >
        <CoverFrame
          src={komgaBookThumbUrl(book.id, memberId)}
          alt=""
          footer={
            pct > 0 && pct < 100 ? (
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent">
                <ProgressBar pct={pct} className="h-1.5" />
              </div>
            ) : undefined
          }
          badge={
            pct >= 100 ? (
              <div className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white p-1 shadow">
                <Check className="w-3.5 h-3.5" />
              </div>
            ) : undefined
          }
        />
        {issueFirst ? (
          <div className="mt-2 min-w-0">
            <p className="text-sm font-semibold text-fg line-clamp-2 leading-snug">
              {issue || bookTitle(book)}
            </p>
            {series ? (
              <p className="mt-0.5 text-[11px] text-muted line-clamp-1">
                {onOpenSeries ? (
                  <span
                    role="link"
                    tabIndex={0}
                    className="hover:underline hover:text-accent cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenSeries();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenSeries();
                      }
                    }}
                  >
                    {series}
                  </span>
                ) : (
                  series
                )}
              </p>
            ) : null}
          </div>
        ) : series && onOpenSeries ? (
          <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">
            <span
              role="link"
              tabIndex={0}
              className="hover:underline hover:text-accent decoration-accent/40 underline-offset-2 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenSeries();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenSeries();
                }
              }}
            >
              {series}
            </span>
            {(book.metadata?.title || book.name) &&
            (book.metadata?.title || book.name) !== series ? (
              <span className="text-muted font-medium">
                {' '}
                · {book.number != null ? `#${book.number}` : book.metadata?.title || book.name}
              </span>
            ) : book.number != null ? (
              <span className="text-muted font-medium"> · #{book.number}</span>
            ) : null}
          </p>
        ) : (
          <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">{bookTitle(book)}</p>
        )}
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <StatusPill book={book} />
          {hero && pct > 0 && pct < 100 && (
            <span className="text-[11px] font-semibold text-accent">CONTINUE</span>
          )}
        </div>
      </button>
    );
  }

  /**
   * Single DOM tree — width/max-width animate so siblings in the flex rail
   * are pushed aside (no absolute overlay, no mount/unmount swap).
   */
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
        'relative text-left group shrink-0 self-start',
        // Smooth layout: only width + chrome, not transform (transform wouldn't push neighbors)
        'transition-[width,box-shadow,background-color,border-color] duration-300 ease-in-out',
        expanded ? expandedTotal : artW,
        expanded &&
          'rounded-2xl bg-surface-1 border border-border shadow-xl shadow-black/20',
      )}
      style={{ willChange: 'width' }}
    >
      <div className="flex flex-row items-start overflow-hidden">
        {/* Cover — fixed size, never scales */}
        <button
          type="button"
          className={cn('shrink-0 text-left', artW)}
          onClick={() => {
            if (longPressFired.current) {
              longPressFired.current = false;
              return;
            }
            onOpen();
          }}
          aria-label={bookTitle(book)}
        >
          <CoverFrame
            src={komgaBookThumbUrl(book.id, memberId)}
            alt=""
            className={cn(
              'transition-[border-radius] duration-300 ease-in-out',
              expanded && '!rounded-l-2xl !rounded-r-none !border-0 !shadow-none',
            )}
            footer={
              !expanded && pct > 0 && pct < 100 ? (
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent">
                  <ProgressBar pct={pct} className="h-1.5" />
                </div>
              ) : undefined
            }
            badge={
              !expanded && pct >= 100 ? (
                <div className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white p-1 shadow">
                  <Check className="w-3.5 h-3.5" />
                </div>
              ) : undefined
            }
          />
          {/* Caption under cover — fades out while expanded so height doesn't fight the rail */}
          <div
            className={cn(
              'transition-opacity duration-200 ease-in-out',
              expanded ? 'opacity-0 h-0 overflow-hidden pointer-events-none' : 'opacity-100',
            )}
          >
            {issueFirst ? (
              <div className="mt-2 min-w-0">
                <p className="text-sm font-semibold text-fg line-clamp-2 leading-snug">
                  {issue || bookTitle(book)}
                </p>
                {series ? (
                  <p className="mt-0.5 text-[11px] text-muted line-clamp-1">
                    {onOpenSeries ? (
                      <span
                        role="link"
                        tabIndex={0}
                        className="hover:underline hover:text-accent cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenSeries();
                        }}
                      >
                        {series}
                      </span>
                    ) : (
                      series
                    )}
                  </p>
                ) : null}
              </div>
            ) : series && onOpenSeries ? (
              <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">
                <span
                  role="link"
                  tabIndex={0}
                  className="hover:underline hover:text-accent decoration-accent/40 underline-offset-2 cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenSeries();
                  }}
                >
                  {series}
                </span>
                {book.number != null ? (
                  <span className="text-muted font-medium"> · #{book.number}</span>
                ) : null}
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">{bookTitle(book)}</p>
            )}
            <div className="mt-0.5 flex items-center justify-between gap-1">
              <StatusPill book={book} />
              {hero && pct > 0 && pct < 100 && (
                <span className="text-[11px] font-semibold text-accent">CONTINUE</span>
              )}
            </div>
          </div>
        </button>

        {/* Detail panel — width 0 → full; min-width keeps content from reflowing mid-tween */}
        <div
          className={cn(
            'overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out min-h-0',
            expanded ? 'max-w-[24rem] opacity-100' : 'max-w-0 opacity-0',
          )}
          aria-hidden={!expanded}
        >
          <div className={cn('flex flex-col justify-between gap-2 p-3 sm:p-4 h-full', panelW)}>
            <div className="min-w-0 space-y-1.5">
              {series && onOpenSeries ? (
                <button
                  type="button"
                  className="text-left text-base sm:text-lg font-bold text-fg leading-snug line-clamp-2 hover:underline hover:text-accent decoration-accent/40 underline-offset-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSeries();
                    collapse();
                  }}
                >
                  {series}
                </button>
              ) : (
                <p className="text-base sm:text-lg font-bold text-fg leading-snug line-clamp-2">
                  {series || bookTitle(book)}
                </p>
              )}
              {issue && series ? (
                <p className="text-xs sm:text-sm text-fg-secondary line-clamp-1">{issue}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs text-muted">
                <StatusPill book={book} />
                {page ? (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">{page}</span>
                  </>
                ) : null}
                {pct > 0 && pct < 100 ? (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">{Math.round(pct)}%</span>
                  </>
                ) : null}
              </div>
              {pct > 0 && pct < 100 ? (
                <ProgressBar pct={pct} className="!bg-inset h-1.5" />
              ) : null}
              {summary ? (
                <p className="text-xs sm:text-sm text-fg-secondary leading-relaxed line-clamp-3">
                  {summary}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0 pt-1">
              {onResume ? (
                <button
                  type="button"
                  tabIndex={expanded ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onResume();
                    collapse();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-ink px-3.5 py-1.5 text-sm font-bold hover:bg-accent-hover"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {pct > 0 && pct < 100 ? 'Resume' : 'Read'}
                </button>
              ) : null}
              <button
                type="button"
                tabIndex={expanded ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                  collapse();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 py-1.5 text-sm font-semibold text-fg hover:bg-nav-hover"
              >
                <Info className="w-4 h-4" />
                More
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

