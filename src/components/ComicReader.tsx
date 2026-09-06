import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import {
  bookTitle,
  komgaBookPages,
  komgaMarkProgress,
  komgaPageImageUrl,
  komgaSiblingBook,
  type KomgaBook,
  type KomgaPageInfo,
} from '../lib/komga';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';

type Props = {
  book: KomgaBook;
  memberId?: string;
  onClose: () => void;
  /** Called when user jumps to next chapter — parent should swap the book. */
  onOpenBook: (book: KomgaBook) => void;
};

export function ComicReader({ book, memberId, onClose, onOpenBook }: Props) {
  const [pages, setPages] = useState<KomgaPageInfo[]>([]);
  const [pageIndex, setPageIndex] = useState(0); // 0-based index into pages array
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [nextChapter, setNextChapter] = useState<KomgaBook | null>(null);
  const [uiVisible, setUiVisible] = useState(true);

  const pageIndexRef = useRef(0);
  const pagesRef = useRef<KomgaPageInfo[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);

  const currentPageNumber = pages[pageIndex]?.number ?? pageIndex + 1;
  const total = pages.length;

  const flushProgress = useCallback(
    async (index: number, list: KomgaPageInfo[]) => {
      if (!list.length) return;
      const pageNum = list[index]?.number ?? index + 1;
      const completed = index >= list.length - 1;
      try {
        await komgaMarkProgress(book.id, pageNum, completed, memberId);
      } catch {
        /* non-fatal */
      }
    },
    [book.id, memberId],
  );

  const scheduleProgress = useCallback(
    (index: number, list: KomgaPageInfo[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushProgress(index, list);
      }, 1000);
    },
    [flushProgress],
  );

  const goTo = useCallback(
    (next: number) => {
      const list = pagesRef.current;
      if (!list.length) return;
      const clamped = Math.max(0, Math.min(list.length - 1, next));
      if (clamped === pageIndexRef.current) return;
      pageIndexRef.current = clamped;
      setPageIndex(clamped);
      setImgError(false);
      scheduleProgress(clamped, list);
    },
    [scheduleProgress],
  );

  const goNext = useCallback(() => goTo(pageIndexRef.current + 1), [goTo]);
  const goPrev = useCallback(() => goTo(pageIndexRef.current - 1), [goTo]);

  // Load pages on open / book change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setImgError(false);
    setNextChapter(null);
    pageIndexRef.current = 0;
    setPageIndex(0);

    void (async () => {
      try {
        const list = await komgaBookPages(book.id, memberId);
        if (cancelled) return;
        if (!list.length) {
          setError('This book has no pages.');
          setPages([]);
          pagesRef.current = [];
          setLoading(false);
          return;
        }
        // Normalize: ensure number field
        const normalized = list.map((p, i) => ({
          ...p,
          number: typeof p.number === 'number' ? p.number : i + 1,
        }));
        pagesRef.current = normalized;
        setPages(normalized);

        // Resume: Komga page is 1-based page number
        const resumePage = book.readProgress?.completed
          ? 1
          : book.readProgress?.page && book.readProgress.page > 0
            ? book.readProgress.page
            : 1;
        let idx = normalized.findIndex((p) => p.number === resumePage);
        if (idx < 0) idx = Math.min(Math.max(0, resumePage - 1), normalized.length - 1);
        pageIndexRef.current = idx;
        setPageIndex(idx);
        setLoading(false);

        void komgaSiblingBook(book.id, 'next', memberId).then((sib) => {
          if (!cancelled) setNextChapter(sib);
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load pages');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Flush progress on unmount / book switch
      void flushProgress(pageIndexRef.current, pagesRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, memberId]);

  // Preload adjacent pages
  useEffect(() => {
    if (!pages.length) return;
    const preload = (idx: number) => {
      const p = pages[idx];
      if (!p) return;
      const img = new Image();
      img.src = komgaPageImageUrl(book.id, p.number, memberId);
    };
    preload(pageIndex + 1);
    preload(pageIndex - 1);
    preload(pageIndex + 2);
  }, [pageIndex, pages, book.id, memberId]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose]);

  const handleClose = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void flushProgress(pageIndexRef.current, pagesRef.current).finally(() => onClose());
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const atEnd = total > 0 && pageIndex >= total - 1;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      {/* Top chrome */}
      <div
        className={cn(
          'absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-2 sm:px-4 h-12 bg-gradient-to-b from-black/80 to-transparent transition-opacity',
          uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-xl hover:bg-white/10"
          title="Close"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{bookTitle(book)}</p>
          {total > 0 && (
            <p className="text-[11px] text-white/60 tabular-nums">
              {pageIndex + 1} / {total}
            </p>
          )}
        </div>
        <button type="button" onClick={handleClose} className="p-2 rounded-xl hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stage */}
      <div
        className="relative flex-1 flex items-center justify-center min-h-0 select-none"
        onClick={() => setUiVisible((v) => !v)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {loading && (
          <div className="flex flex-col items-center gap-2 text-white/70">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading pages…</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center space-y-3 px-6">
            <p className="text-sm text-red-300">{error}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError(null);
                void komgaBookPages(book.id, memberId)
                  .then((list) => {
                    if (!list.length) {
                      setError('This book has no pages.');
                      return;
                    }
                    const normalized = list.map((p, i) => ({
                      ...p,
                      number: typeof p.number === 'number' ? p.number : i + 1,
                    }));
                    pagesRef.current = normalized;
                    setPages(normalized);
                    setPageIndex(0);
                    pageIndexRef.current = 0;
                  })
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : 'Failed to load pages'),
                  )
                  .finally(() => setLoading(false));
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && pages.length > 0 && (
          <>
            {/* Tap zones */}
            <button
              type="button"
              className="absolute left-0 top-0 bottom-0 w-1/3 z-[5]"
              aria-label="Previous page"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
            />
            <button
              type="button"
              className="absolute right-0 top-0 bottom-0 w-1/3 z-[5]"
              aria-label="Next page"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
            />

            {imgError ? (
              <div className="text-center space-y-3 px-6 z-[6]">
                <p className="text-sm text-red-300">Could not load this page.</p>
                <Button size="sm" variant="secondary" onClick={() => setImgError(false)}>
                  Retry
                </Button>
              </div>
            ) : (
              <img
                key={`${book.id}-${currentPageNumber}`}
                src={komgaPageImageUrl(book.id, currentPageNumber, memberId)}
                alt={`Page ${pageIndex + 1}`}
                className="max-h-full max-w-full object-contain pointer-events-none"
                draggable={false}
                onError={() => setImgError(true)}
              />
            )}
          </>
        )}
      </div>

      {/* Bottom chrome */}
      <div
        className={cn(
          'absolute bottom-0 inset-x-0 z-10 flex items-center justify-center gap-4 px-3 py-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity',
          uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <button
          type="button"
          onClick={goPrev}
          disabled={pageIndex <= 0}
          className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-sm tabular-nums text-white/80 min-w-[4.5rem] text-center">
          {total ? `${pageIndex + 1} / ${total}` : '—'}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={pageIndex >= total - 1}
          className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* End of book */}
      {atEnd && !loading && !error && (
        <div className="absolute bottom-16 inset-x-0 z-20 flex justify-center px-4">
          <div className="rounded-2xl bg-black/85 border border-white/15 px-4 py-3 text-center space-y-2 max-w-sm">
            <p className="text-sm font-medium">End of this book</p>
            {nextChapter ? (
              <Button
                size="sm"
                onClick={() => {
                  void flushProgress(pageIndexRef.current, pagesRef.current).then(() =>
                    onOpenBook(nextChapter),
                  );
                }}
              >
                Next chapter → {bookTitle(nextChapter)}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleClose}>
                Back to library
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
