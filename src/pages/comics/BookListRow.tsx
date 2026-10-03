// src/pages/comics/BookListRow.tsx
// Compact list row for series detail book lists.

import {
  bookProgressPercent,
  bookTitle,
  komgaBookThumbUrl,
  type KomgaBook,
} from '../../lib/komga';
import { ProgressBar, StatusPill } from './CoverChrome';

export function BookListRow({
  book,
  memberId,
  index,
  onOpen,
}: {
  book: KomgaBook;
  memberId?: string;
  index: number;
  onOpen: () => void;
}) {
  const pct = bookProgressPercent(book);
  const label =
    book.number != null
      ? `#${book.number}`
      : book.name || book.metadata?.title || `Book ${index + 1}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-nav-hover text-left border border-transparent hover:border-border transition-colors"
    >
      <span className="text-xs tabular-nums text-muted w-8 shrink-0 text-right">{index + 1}</span>
      <img
        src={komgaBookThumbUrl(book.id, memberId)}
        alt=""
        className="w-12 h-[4.5rem] rounded-lg object-cover border border-border shrink-0"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg truncate">
          {book.number != null ? `${label} · ` : ''}
          {book.metadata?.title || book.name || bookTitle(book)}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <StatusPill book={book} />
          {pct > 0 && pct < 100 && (
            <div className="flex-1 max-w-[8rem]">
              <ProgressBar pct={pct} className="h-1" />
            </div>
          )}
        </div>
      </div>
      <span className="text-xs font-semibold text-accent shrink-0 hidden sm:inline">
        {pct > 0 && pct < 100 ? 'Continue' : pct >= 100 ? 'Read again' : 'Read'}
      </span>
    </button>
  );
}
