/**
 * GreenHQ Comic Reader (Phase 2)
 * Full-screen portal · Komga-backed pages & progress · per-member prefs
 * Does NOT embed Komga's web UI.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Maximize,
  Minimize,
  Play,
  Settings2,
  X,
} from 'lucide-react';
import {
  bookTitle,
  komgaBookPages,
  komgaBookThumbUrl,
  komgaMarkProgress,
  komgaPageImageUrl,
  komgaSiblingBook,
  type KomgaBook,
  type KomgaPageInfo,
} from '../lib/komga';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';

type FitMode = 'width' | 'height' | 'screen' | 'actual';
type ViewMode = 'single' | 'double' | 'vertical';
type Direction = 'ltr' | 'rtl';

type ReaderPrefs = {
  fit: FitMode;
  viewMode: ViewMode;
  direction: Direction;
  zoom: number; // 0.5–3, multiplies fit
};

const DEFAULT_PREFS: ReaderPrefs = {
  fit: 'screen',
  viewMode: 'single',
  direction: 'ltr',
  zoom: 1,
};

function prefsKey(memberId?: string) {
  return `greenhq-comic-reader-${memberId || 'default'}`;
}

function loadPrefs(memberId?: string): ReaderPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(memberId));
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      fit: p.fit && ['width', 'height', 'screen', 'actual'].includes(p.fit) ? p.fit : DEFAULT_PREFS.fit,
      viewMode:
        p.viewMode && ['single', 'double', 'vertical'].includes(p.viewMode)
          ? p.viewMode
          : DEFAULT_PREFS.viewMode,
      direction: p.direction === 'rtl' ? 'rtl' : 'ltr',
      zoom: typeof p.zoom === 'number' && p.zoom >= 0.5 && p.zoom <= 3 ? p.zoom : 1,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(memberId: string | undefined, prefs: ReaderPrefs) {
  try {
    localStorage.setItem(prefsKey(memberId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

type Props = {
  book: KomgaBook;
  memberId?: string;
  onClose: () => void;
  /** Parent swaps book (next chapter) without unmounting the Comics page. */
  onOpenBook: (book: KomgaBook) => void;
};

export function ComicReader({ book, memberId, onClose, onOpenBook }: Props) {
  const [pages, setPages] = useState<KomgaPageInfo[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [nextChapter, setNextChapter] = useState<KomgaBook | null>(null);
  const [showEndOverlay, setShowEndOverlay] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => loadPrefs(memberId));
  const [isFs, setIsFs] = useState(false);

  const pageIndexRef = useRef(0);
  const pagesRef = useRef<KomgaPageInfo[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideUiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const verticalRef = useRef<HTMLDivElement | null>(null);

  const total = pages.length;
  const currentPageNumber = pages[pageIndex]?.number ?? pageIndex + 1;
  const atEnd = total > 0 && pageIndex >= total - 1;

  const updatePrefs = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        savePrefs(memberId, next);
        return next;
      });
    },
    [memberId],
  );

  const flushProgress = useCallback(
    async (index: number, list: KomgaPageInfo[]) => {
      if (!list.length) return;
      const pageNum = list[index]?.number ?? index + 1;
      const completed = index >= list.length - 1;
      try {
        await komgaMarkProgress(book.id, pageNum, completed, memberId);
      } catch {
        /* non-fatal — KOReader / Komga remain source of truth when online */
      }
    },
    [book.id, memberId],
  );

  const scheduleProgress = useCallback(
    (index: number, list: KomgaPageInfo[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushProgress(index, list);
      }, 1200);
    },
    [flushProgress],
  );

  const bumpUi = useCallback(() => {
    setUiVisible(true);
    if (hideUiTimer.current) clearTimeout(hideUiTimer.current);
    hideUiTimer.current = setTimeout(() => {
      setUiVisible(false);
      setSettingsOpen(false);
      setInfoOpen(false);
    }, 2800);
  }, []);

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
      bumpUi();
    },
    [scheduleProgress, bumpUi],
  );

  const goNext = useCallback(() => {
    const step = prefs.viewMode === 'double' ? 2 : 1;
    const list = pagesRef.current;
    const cur = pageIndexRef.current;
    if (list.length && cur + step >= list.length) {
      // Past the last page → end-of-issue overlay (series continuity)
      setShowEndOverlay(true);
      // Snap to last page and mark progress complete
      if (cur < list.length - 1) goTo(list.length - 1);
      else void flushProgress(list.length - 1, list);
      bumpUi();
      return;
    }
    goTo(cur + step);
  }, [goTo, prefs.viewMode, flushProgress, bumpUi]);

  const goPrev = useCallback(() => {
    setShowEndOverlay(false);
    const step = prefs.viewMode === 'double' ? 2 : 1;
    goTo(pageIndexRef.current - step);
  }, [goTo, prefs.viewMode]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Load pages + resume + next chapter
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setImgError(false);
    setNextChapter(null);
    setSettingsOpen(false);
    setInfoOpen(false);
    pageIndexRef.current = 0;
    setShowEndOverlay(false);
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
        const normalized = list.map((p, i) => ({
          ...p,
          number: typeof p.number === 'number' ? p.number : i + 1,
        }));
        pagesRef.current = normalized;
        setPages(normalized);

        // Resume from Komga progress (1-based page numbers)
        let resumePage = 1;
        if (!book.readProgress?.completed && book.readProgress?.page && book.readProgress.page > 0) {
          resumePage = book.readProgress.page;
        }
        let idx = normalized.findIndex((p) => p.number === resumePage);
        if (idx < 0) idx = Math.min(Math.max(0, resumePage - 1), normalized.length - 1);
        pageIndexRef.current = idx;
        setPageIndex(idx);
        setLoading(false);
        bumpUi();

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
      if (hideUiTimer.current) clearTimeout(hideUiTimer.current);
      // Commit progress when leaving this book (swap chapter or unmount)
      void flushProgress(pageIndexRef.current, pagesRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload on book change
  }, [book.id, memberId]);

  // Preload adjacent page images (never the whole book)
  useEffect(() => {
    if (!pages.length) return;
    const idxs = [pageIndex - 1, pageIndex, pageIndex + 1, pageIndex + 2];
    if (prefs.viewMode === 'double') idxs.push(pageIndex + 3);
    for (const i of idxs) {
      if (i < 0 || i >= pages.length) continue;
      const num = pages[i]?.number ?? i + 1;
      const img = new Image();
      img.src = komgaPageImageUrl(book.id, num, memberId);
    }
  }, [pageIndex, pages, book.id, memberId, prefs.viewMode]);

  // Vertical (webtoon): show end overlay when scrolled near the bottom
  useEffect(() => {
    if (prefs.viewMode !== 'vertical') return;
    const el = verticalRef.current;
    if (!el) return;
    const onScroll = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < 120 && pagesRef.current.length > 0) {
        setShowEndOverlay(true);
        void flushProgress(pagesRef.current.length - 1, pagesRef.current);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [prefs.viewMode, flushProgress, pages.length, book.id]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const rtl = prefs.direction === 'rtl';
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
        case 'ArrowRight':
          e.preventDefault();
          rtl ? goPrev() : goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          rtl ? goNext() : goPrev();
          break;
        case ' ':
          e.preventDefault();
          goNext();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          void toggleFullscreen();
          break;
        case '+':
        case '=':
          e.preventDefault();
          updatePrefs({ zoom: Math.min(3, Math.round((prefs.zoom + 0.1) * 10) / 10) });
          bumpUi();
          break;
        case '-':
        case '_':
          e.preventDefault();
          updatePrefs({ zoom: Math.max(0.5, Math.round((prefs.zoom - 0.1) * 10) / 10) });
          bumpUi();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // handleClose defined below — stable enough via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNext, goPrev, prefs.direction, prefs.zoom, updatePrefs, bumpUi]);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      /* not supported */
    }
  };

  const handleClose = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void flushProgress(pageIndexRef.current, pagesRef.current).finally(() => onClose());
  };

  // Flush progress on unmount (e.g. parent tears down reader without handleClose)
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // fire-and-forget — component is leaving
      void flushProgress(pageIndexRef.current, pagesRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
  }, []);

  const onTouchStart = (e: ReactTouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
    touchStartY.current = e.changedTouches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (prefs.viewMode === 'vertical') return; // vertical uses scroll
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (startX == null) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const endY = e.changedTouches[0]?.clientY ?? startY ?? 0;
    const dx = endX - startX;
    const dy = endY - (startY ?? 0);
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    const rtl = prefs.direction === 'rtl';
    if (dx < 0) (rtl ? goPrev : goNext)();
    else (rtl ? goNext : goPrev)();
  };

  /** Stage click zones: left/right navigate, center toggles chrome */
  const onStageClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (prefs.viewMode === 'vertical') {
      bumpUi();
      setUiVisible((v) => !v);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const rtl = prefs.direction === 'rtl';
    if (x < 0.28) {
      rtl ? goNext() : goPrev();
    } else if (x > 0.72) {
      rtl ? goPrev() : goNext();
    } else {
      setUiVisible((v) => !v);
      if (!uiVisible) bumpUi();
    }
  };

  const fitClass = useMemo(() => {
    switch (prefs.fit) {
      case 'width':
        return 'w-full h-auto max-h-none';
      case 'height':
        return 'h-full w-auto max-w-none';
      case 'actual':
        return 'w-auto h-auto max-w-none max-h-none';
      case 'screen':
      default:
        return 'max-h-full max-w-full w-auto h-auto object-contain';
    }
  }, [prefs.fit]);

  const pageSrc = (index: number) => {
    if (index < 0 || index >= pages.length) return null;
    const num = pages[index]?.number ?? index + 1;
    return komgaPageImageUrl(book.id, num, memberId);
  };

  const authors = (book.metadata?.authors || [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ');

  const ui = (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[200] flex flex-col bg-black text-white"
      onMouseMove={bumpUi}
    >
      {/* Top chrome */}
      <div
        className={cn(
          'absolute top-0 inset-x-0 z-20 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 h-12 bg-gradient-to-b from-black/85 to-transparent transition-opacity duration-300',
          uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-xl hover:bg-white/10"
          title="Back"
          aria-label="Back to library"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{bookTitle(book)}</p>
          {total > 0 && (
            <p className="text-[11px] text-white/55 tabular-nums">
              {pageIndex + 1}
              {prefs.viewMode === 'double' && pageIndex + 1 < total ? `–${pageIndex + 2}` : ''} /{' '}
              {total}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setInfoOpen((v) => !v);
            setSettingsOpen(false);
            bumpUi();
          }}
          className="p-2 rounded-xl hover:bg-white/10"
          title="Book info"
          aria-label="Book info"
        >
          <Info className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setSettingsOpen((v) => !v);
            setInfoOpen(false);
            bumpUi();
          }}
          className="p-2 rounded-xl hover:bg-white/10"
          title="Reader settings"
          aria-label="Reader settings"
        >
          <Settings2 className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="p-2 rounded-xl hover:bg-white/10 hidden sm:inline-flex"
          title="Fullscreen (F)"
          aria-label={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-xl hover:bg-white/10"
          title="Close"
          aria-label="Close reader"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Settings panel */}
      {settingsOpen && uiVisible && (
        <div className="absolute top-12 right-2 z-30 w-64 rounded-2xl bg-black/90 border border-white/15 p-3 space-y-3 text-sm shadow-xl">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">View</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['single', 'Single'],
                ['double', 'Double'],
                ['vertical', 'Vertical'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => updatePrefs({ viewMode: id })}
                className={cn(
                  'px-2.5 py-1 rounded-lg border text-xs',
                  prefs.viewMode === id
                    ? 'border-accent bg-accent/20 text-white'
                    : 'border-white/15 text-white/70 hover:bg-white/10',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Fit</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['screen', 'Screen'],
                ['width', 'Width'],
                ['height', 'Height'],
                ['actual', 'Actual'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => updatePrefs({ fit: id })}
                className={cn(
                  'px-2.5 py-1 rounded-lg border text-xs',
                  prefs.fit === id
                    ? 'border-accent bg-accent/20 text-white'
                    : 'border-white/15 text-white/70 hover:bg-white/10',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Direction</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['ltr', 'Left → Right'],
                ['rtl', 'Right → Left'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => updatePrefs({ direction: id })}
                className={cn(
                  'px-2.5 py-1 rounded-lg border text-xs',
                  prefs.direction === id
                    ? 'border-accent bg-accent/20 text-white'
                    : 'border-white/15 text-white/70 hover:bg-white/10',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white/70">Zoom</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2 py-0.5 rounded border border-white/15 text-xs"
                onClick={() => updatePrefs({ zoom: Math.max(0.5, Math.round((prefs.zoom - 0.1) * 10) / 10) })}
              >
                −
              </button>
              <span className="tabular-nums text-xs w-10 text-center">{Math.round(prefs.zoom * 100)}%</span>
              <button
                type="button"
                className="px-2 py-0.5 rounded border border-white/15 text-xs"
                onClick={() => updatePrefs({ zoom: Math.min(3, Math.round((prefs.zoom + 0.1) * 10) / 10) })}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info panel */}
      {infoOpen && uiVisible && (
        <div className="absolute top-12 left-2 z-30 w-72 max-w-[90vw] rounded-2xl bg-black/90 border border-white/15 p-3 space-y-2 text-sm shadow-xl">
          <p className="font-semibold">{bookTitle(book)}</p>
          {book.seriesTitle && <p className="text-white/60 text-xs">{book.seriesTitle}</p>}
          {authors && <p className="text-white/80 text-xs">{authors}</p>}
          {typeof book.media?.pagesCount === 'number' && (
            <p className="text-white/55 text-xs">{book.media.pagesCount} pages</p>
          )}
          {book.metadata?.summary && (
            <p className="text-white/65 text-xs leading-relaxed line-clamp-6">{book.metadata.summary}</p>
          )}
        </div>
      )}

      {/* Stage */}
      <div
        className="relative flex-1 min-h-0 select-none"
        onClick={onStageClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            {book.id && (
              <img
                src={komgaBookThumbUrl(book.id, memberId)}
                alt=""
                className="w-24 rounded-lg opacity-40 object-cover aspect-[2/3]"
              />
            )}
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Opening…</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <Button size="sm" variant="secondary" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}

        {!loading && !error && prefs.viewMode === 'vertical' && (
          <div
            ref={verticalRef}
            className="h-full overflow-y-auto overscroll-contain"
            onScroll={() => {
              const el = verticalRef.current;
              if (!el || !pages.length) return;
              // Approximate page from scroll position
              const ratio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
              const idx = Math.min(pages.length - 1, Math.floor(ratio * pages.length));
              if (idx !== pageIndexRef.current) {
                pageIndexRef.current = idx;
                setPageIndex(idx);
                scheduleProgress(idx, pagesRef.current);
              }
            }}
          >
            <div className="mx-auto max-w-3xl flex flex-col gap-1 py-2">
              {pages.map((p, i) => {
                // Only render a window around current for memory
                if (Math.abs(i - pageIndex) > 4 && Math.abs(i - pageIndex) > pages.length * 0.02) {
                  // still render spacer approx height for scroll stability is hard without knowing size —
                  // render all for vertical webtoon of moderate length; for huge books limit window
                  if (pages.length > 80 && Math.abs(i - pageIndex) > 6) {
                    return <div key={p.number ?? i} className="h-[50vh]" />;
                  }
                }
                const src = pageSrc(i);
                if (!src) return null;
                return (
                  <img
                    key={`${book.id}-v-${p.number ?? i}`}
                    src={src}
                    alt={`Page ${i + 1}`}
                    className="w-full h-auto"
                    draggable={false}
                    loading={Math.abs(i - pageIndex) <= 2 ? 'eager' : 'lazy'}
                  />
                );
              })}
            </div>
          </div>
        )}

        {!loading && !error && prefs.viewMode !== 'vertical' && (
          <div className="h-full w-full flex items-center justify-center gap-1 px-1 overflow-hidden">
            {imgError ? (
              <p className="text-sm text-red-300">Couldn&apos;t load this page.</p>
            ) : (
              <>
                <img
                  key={`${book.id}-${currentPageNumber}-a`}
                  src={pageSrc(pageIndex) || ''}
                  alt={`Page ${pageIndex + 1}`}
                  className={cn(fitClass, 'pointer-events-none')}
                  style={{ transform: `scale(${prefs.zoom})`, transformOrigin: 'center center' }}
                  draggable={false}
                  onError={() => setImgError(true)}
                />
                {prefs.viewMode === 'double' && pageIndex + 1 < total && (
                  <img
                    key={`${book.id}-${pages[pageIndex + 1]?.number}-b`}
                    src={pageSrc(pageIndex + 1) || ''}
                    alt={`Page ${pageIndex + 2}`}
                    className={cn(fitClass, 'pointer-events-none hidden md:block')}
                    style={{ transform: `scale(${prefs.zoom})`, transformOrigin: 'center center' }}
                    draggable={false}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom chrome */}
      <div
        className={cn(
          'absolute bottom-0 inset-x-0 z-20 flex items-center justify-center gap-4 px-3 py-3 bg-gradient-to-t from-black/85 to-transparent transition-opacity duration-300',
          uiVisible && prefs.viewMode !== 'vertical' ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          disabled={pageIndex <= 0}
          className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-sm tabular-nums text-white/80 min-w-[5rem] text-center">
          {total ? `${pageIndex + 1} / ${total}` : '—'}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="p-2 rounded-xl hover:bg-white/10"
          aria-label={pageIndex >= total - 1 ? 'Finished — up next' : 'Next page'}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* End of issue — Up next (series continuity) */}
      {atEnd && !showEndOverlay && !loading && !error && prefs.viewMode !== 'vertical' && (
        <div className="absolute bottom-20 right-3 sm:bottom-24 sm:right-5 z-30 pointer-events-none">
          <button
            type="button"
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-2xl',
              'bg-black/90 border border-white/20 shadow-2xl shadow-black/50',
              'pl-2.5 pr-3.5 py-2 text-left',
              'hover:bg-black hover:border-white/35 transition-colors',
              'max-w-[14rem] sm:max-w-[16rem]',
            )}
            onClick={(e) => {
              e.stopPropagation();
              setShowEndOverlay(true);
              void flushProgress(pageIndexRef.current, pagesRef.current);
            }}
            aria-label={nextChapter ? 'Finished — up next issue' : 'Finished'}
          >
            {nextChapter ? (
              <img
                src={komgaBookThumbUrl(nextChapter.id, memberId)}
                alt=""
                className="w-10 h-[3.75rem] sm:w-11 sm:h-[4.15rem] object-cover rounded-lg border border-white/15 shrink-0 shadow"
              />
            ) : (
              <span className="w-10 h-[3.75rem] rounded-lg bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-emerald-400" />
              </span>
            )}
            <span className="min-w-0 py-0.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300/95">
                {nextChapter ? 'Up next' : 'Finished'}
              </span>
              {nextChapter ? (
                <>
                  <span className="block text-xs font-semibold text-white leading-snug line-clamp-2 mt-0.5">
                    {nextChapter.number != null ? `#${nextChapter.number}` : bookTitle(nextChapter)}
                    {nextChapter.number != null && (nextChapter.metadata?.title || nextChapter.name)
                      ? ` · ${nextChapter.metadata?.title || nextChapter.name}`
                      : ''}
                  </span>
                  <span className="block text-[10px] text-white/50 mt-0.5">Tap for next issue</span>
                </>
              ) : (
                <span className="block text-xs text-white/70 mt-0.5 line-clamp-2">{bookTitle(book)}</span>
              )}
            </span>
          </button>
        </div>
      )}

      {showEndOverlay && !loading && !error && (
        <div
          className={cn(
            'absolute inset-0 z-40 flex items-center justify-center p-4',
            'bg-black/80 backdrop-blur-sm',
            // Soft appearance when simply on last page; full commitment after next-past-end
            showEndOverlay ? 'opacity-100' : 'opacity-100',
          )}
          role="dialog"
          aria-label="End of issue"
          onClick={(e) => {
            // Click outside card → stay; don't close accidentally
            e.stopPropagation();
          }}
        >
          <div
            className={cn(
              'w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950/95 shadow-2xl',
              'overflow-hidden',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {nextChapter ? (
              <div className="flex gap-4 p-4 sm:p-5">
                <img
                  src={komgaBookThumbUrl(nextChapter.id, memberId)}
                  alt=""
                  className="w-[5.5rem] sm:w-[6.5rem] aspect-[2/3] object-cover rounded-xl border border-white/10 shadow-lg shrink-0"
                />
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300/90">
                    Up next
                  </p>
                  <p className="mt-1 text-lg sm:text-xl font-bold text-white leading-snug line-clamp-2">
                    {nextChapter.seriesTitle || nextChapter.series?.name || bookTitle(nextChapter)}
                  </p>
                  <p className="mt-0.5 text-sm text-white/70 line-clamp-2">
                    {nextChapter.number != null ? `#${nextChapter.number}` : ''}
                    {nextChapter.number != null && (nextChapter.metadata?.title || nextChapter.name)
                      ? ' · '
                      : ''}
                    {nextChapter.metadata?.title || nextChapter.name || ''}
                  </p>
                  <p className="mt-2 text-[11px] text-white/45 line-clamp-1">
                    Finished · {bookTitle(book)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-5 text-center space-y-2">
                <div className="flex justify-center text-emerald-400">
                  <BookOpen className="w-7 h-7" />
                </div>
                <p className="text-base font-bold text-white">Finished</p>
                <p className="text-sm text-white/60 line-clamp-2">{bookTitle(book)}</p>
                <p className="text-xs text-white/40">No next issue in this series</p>
              </div>
            )}

            <div className="px-4 pb-4 sm:px-5 sm:pb-5 flex flex-col gap-2">
              {nextChapter ? (
                <Button
                  className="w-full !font-bold"
                  onClick={() => {
                    void flushProgress(pageIndexRef.current, pagesRef.current).then(() => {
                      setShowEndOverlay(false);
                      onOpenBook(nextChapter);
                    });
                  }}
                >
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Read next
                </Button>
              ) : null}
              <Button
                variant="secondary"
                className="w-full !bg-white/10 !text-white !border-white/20 hover:!bg-white/15"
                onClick={() => {
                  setShowEndOverlay(false);
                  handleClose();
                }}
              >
                Done
              </Button>
              <button
                type="button"
                className="text-xs text-white/50 hover:text-white/80 py-1"
                onClick={() => setShowEndOverlay(false)}
              >
                Back to last page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return ui;
  return createPortal(ui, document.body);
}
