/**
 * Featured "Continue reading" hero for Comics Home.
 * Cover + series/issue + page progress + Resume / More — rest of queue stays in a rail.
 */
import { BookOpen, Info, Play } from 'lucide-react';
import { Button } from './ui/Button';
import {
  bookProgressPercent,
  bookTitle,
  komgaBookThumbUrl,
  type KomgaBook,
} from '../lib/komga';
import { cn } from '../lib/cn';

function pageLabel(book: KomgaBook): string | null {
  const page = book.readProgress?.page;
  const total = book.media?.pagesCount;
  if (typeof page === 'number' && page > 0 && typeof total === 'number' && total > 0) {
    return `Page ${page} of ${total}`;
  }
  if (typeof page === 'number' && page > 0) return `Page ${page}`;
  if (typeof total === 'number' && total > 0) return `${total} pages`;
  return null;
}

function issueLine(book: KomgaBook): string | null {
  const parts: string[] = [];
  if (book.number != null && book.number !== '') parts.push(`#${book.number}`);
  const issueName = book.metadata?.title || book.name;
  if (issueName && issueName !== book.seriesTitle) parts.push(issueName);
  return parts.length ? parts.join(' · ') : null;
}

export function ComicContinueHero({
  book,
  memberId,
  onResume,
  onMore,
  onOpenSeries,
}: {
  book: KomgaBook;
  memberId?: string;
  onResume: () => void;
  onMore: () => void;
  onOpenSeries?: () => void;
}) {
  const pct = bookProgressPercent(book);
  const series =
    book.seriesTitle || book.series?.name || book.metadata?.title || book.name || 'Untitled';
  const issue = issueLine(book);
  const pages = pageLabel(book);
  const cover = komgaBookThumbUrl(book.id, memberId);
  const summary = (book.metadata?.summary || '').trim();
  const actionLabel = pct > 0 && pct < 100 ? 'Resume' : 'Read';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-surface-2',
        'min-h-[12rem] sm:min-h-[14rem]',
      )}
    >
      {/* Soft cover wash behind content */}
      <img
        src={cover}
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl scale-110"
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/95 to-surface/70" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-surface/40" />

      <div className="relative z-10 flex flex-row gap-4 sm:gap-5 p-4 sm:p-5 items-stretch min-h-[12rem] sm:min-h-[14rem]">
        <button
          type="button"
          onClick={onMore}
          className="shrink-0 w-[6.5rem] sm:w-[7.75rem] md:w-[8.5rem] self-center"
          aria-label={`Details for ${bookTitle(book)}`}
        >
          <img
            src={cover}
            alt=""
            className="w-full aspect-[2/3] object-cover rounded-xl border border-border shadow-lg shadow-black/30"
            loading="eager"
          />
        </button>

        <div className="flex-1 flex flex-col justify-center min-w-0 py-0.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300/95 mb-1.5 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Continue reading
          </p>

          {onOpenSeries ? (
            <button
              type="button"
              onClick={onOpenSeries}
              className="text-left text-xl sm:text-2xl md:text-3xl font-bold text-fg tracking-tight leading-tight line-clamp-2 hover:underline hover:text-accent decoration-accent/40 underline-offset-2"
            >
              {series}
            </button>
          ) : (
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-fg tracking-tight leading-tight line-clamp-2">
              {series}
            </h2>
          )}
          {issue ? (
            <p className="mt-1 text-sm sm:text-base text-fg-secondary line-clamp-1">{issue}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-muted">
            {pages ? <span className="font-semibold text-accent tabular-nums">{pages}</span> : null}
            {pct > 0 && pct < 100 ? (
              <>
                {pages ? <span className="text-border-strong">·</span> : null}
                <span className="tabular-nums">{Math.round(pct)}% read</span>
              </>
            ) : null}
          </div>

          {pct > 0 && pct < 100 ? (
            <div className="mt-2.5 max-w-sm">
              <div className="h-1.5 rounded-full bg-inset overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : null}

          {summary ? (
            <p className="mt-2 text-xs sm:text-sm text-fg-secondary leading-relaxed line-clamp-2 max-w-xl">
              {summary}
            </p>
          ) : null}

          <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2">
            <Button size="md" className="!font-bold min-w-[7.5rem]" onClick={onResume}>
              <Play className="w-4 h-4 mr-1.5 fill-current" />
              {actionLabel}
            </Button>
            <Button size="md" variant="secondary" onClick={onMore}>
              <Info className="w-4 h-4 mr-1.5" />
              More info
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
