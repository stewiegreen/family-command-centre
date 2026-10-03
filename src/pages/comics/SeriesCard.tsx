// src/pages/comics/SeriesCard.tsx

import { seriesTitle, komgaSeriesThumbUrl, type KomgaSeries } from '../../lib/komga';
import { cn } from '../../lib/cn';
import { COVER_SERIES, CoverFrame } from './CoverChrome';

export function SeriesCard({
  series,
  memberId,
  onOpen,
}: {
  series: KomgaSeries;
  memberId?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('shrink-0 text-left group', COVER_SERIES)}
      aria-label={seriesTitle(series)}
    >
      <CoverFrame
        src={komgaSeriesThumbUrl(series.id, memberId)}
        alt=""
        badge={
          typeof series.booksUnreadCount === 'number' && series.booksUnreadCount > 0 ? (
            <span className="absolute top-2 right-2 rounded-full bg-black/80 text-white text-[11px] font-medium px-2 py-0.5">
              {series.booksUnreadCount} unread
            </span>
          ) : undefined
        }
      />
      <p className="mt-2 text-sm font-semibold text-fg line-clamp-2">{seriesTitle(series)}</p>
      <p className="text-[11px] text-muted mt-0.5">
        {typeof series.booksCount === 'number'
          ? `${series.booksCount} ${series.booksCount === 1 ? 'book' : 'books'}`
          : 'Series'}
      </p>
    </button>
  );
}
