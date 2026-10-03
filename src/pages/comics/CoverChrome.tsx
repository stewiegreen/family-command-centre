// src/pages/comics/CoverChrome.tsx
// Shared cover chrome for the comics library (ProgressBar, StatusPill, CoverFrame).

import type { ReactNode } from 'react';
import { BookOpen, Check } from 'lucide-react';
import { bookProgressPercent, type KomgaBook } from '../../lib/komga';
import { cn } from '../../lib/cn';

/** ~5 across desktop, 2–3 on phone — cover-first */
export const COVER_BOOK =
  'w-[42%] min-w-[9.5rem] max-w-[11rem] sm:w-[30%] sm:max-w-[12rem] md:w-[18%] md:min-w-[10rem] md:max-w-[13rem]';
export const COVER_SERIES =
  'w-[46%] min-w-[10rem] max-w-[12rem] sm:w-[30%] sm:max-w-[13rem] md:w-[18%] md:min-w-[11rem] md:max-w-[14rem]';

export function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  if (pct <= 0 || pct >= 100) return null;
  return (
    <div className={cn('h-1 rounded-full bg-black/40 overflow-hidden', className)}>
      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusPill({ book }: { book: KomgaBook }) {
  const pct = bookProgressPercent(book);
  if (pct >= 100 || book.readProgress?.completed) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="w-3 h-3" /> Read
      </span>
    );
  }
  if (pct > 0) {
    return <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">{Math.round(pct)}%</span>;
  }
  return <span className="text-[11px] text-muted">Unread</span>;
}

/** Shared cover chrome — book, series, recommendation, collection. */
export function CoverFrame({
  src,
  alt,
  badge,
  footer,
  className,
}: {
  src?: string;
  alt?: string;
  badge?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative aspect-[2/3] rounded-2xl overflow-hidden bg-surface-2 border border-border shadow-md',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={alt || ''}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted">
          <BookOpen className="w-8 h-8 opacity-40" />
        </div>
      )}
      {footer}
      {badge}
    </div>
  );
}
