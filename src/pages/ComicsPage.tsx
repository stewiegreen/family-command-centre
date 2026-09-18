/**
 * Phase 3 — GreenHQ Comic Library Experience
 * Cover-first browsing · Komga source of truth · Phase 2 reader unchanged
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Library,
  List,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ComicRecommendation } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { ComicReader } from '../components/ComicReader';
import {
  bookProgressPercent,
  bookTitle,
  komgaBook,
  komgaBookThumbUrl,
  komgaBooks,
  komgaCollectionSeries,
  komgaCollectionThumbUrl,
  komgaCollections,
  komgaInProgress,
  komgaLatestBooks,
  komgaLibraries,
  komgaOnDeck,
  komgaReadlistBooks,
  komgaReadlistThumbUrl,
  komgaReadlists,
  komgaRecentlyRead,
  komgaSeries,
  komgaSeriesBooksPage,
  letterSearchRegex,
  komgaSeriesDetail,
  komgaSeriesThumbUrl,
  seriesTitle,
  type KomgaBook,
  type KomgaCollection,
  type KomgaLibrary,
  type KomgaReadList,
  type KomgaSeries,
} from '../lib/komga';
import { cn } from '../lib/cn';

type Tab = 'home' | 'library' | 'collections' | 'lists' | 'search';

type Browse =
  | { kind: 'root' }
  | { kind: 'series'; series: KomgaSeries }
  | { kind: 'collection'; collection: KomgaCollection }
  | { kind: 'readlist'; readlist: KomgaReadList }
  | { kind: 'library'; library: KomgaLibrary };

/** ~5 across desktop, 2–3 on phone — cover-first */
const COVER_BOOK =
  'w-[42%] min-w-[9.5rem] max-w-[11rem] sm:w-[30%] sm:max-w-[12rem] md:w-[18%] md:min-w-[10rem] md:max-w-[13rem]';
const COVER_SERIES =
  'w-[46%] min-w-[10rem] max-w-[12rem] sm:w-[30%] sm:max-w-[13rem] md:w-[18%] md:min-w-[11rem] md:max-w-[14rem]';

function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  if (pct <= 0 || pct >= 100) return null;
  return (
    <div className={cn('h-1 rounded-full bg-black/40 overflow-hidden', className)}>
      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusPill({ book }: { book: KomgaBook }) {
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

function BookCard({
  book,
  memberId,
  onOpen,
  hero,
}: {
  book: KomgaBook;
  memberId?: string;
  onOpen: () => void;
  hero?: boolean;
}) {
  const pct = bookProgressPercent(book);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('shrink-0 text-left group', hero ? COVER_SERIES : COVER_BOOK)}
    >
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-surface-2 border border-border shadow-md">
        <img
          src={komgaBookThumbUrl(book.id, memberId)}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent">
          <ProgressBar pct={pct} className="h-1.5" />
        </div>
        {pct >= 100 && (
          <div className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white p-1 shadow">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">{bookTitle(book)}</p>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <StatusPill book={book} />
        {hero && pct > 0 && pct < 100 && (
          <span className="text-[11px] font-semibold text-accent">CONTINUE</span>
        )}
      </div>
    </button>
  );
}

function SeriesCard({
  series,
  memberId,
  onOpen,
}: {
  series: KomgaSeries;
  memberId?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className={cn('shrink-0 text-left group', COVER_SERIES)}>
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-surface-2 border border-border shadow-md">
        <img
          src={komgaSeriesThumbUrl(series.id, memberId)}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {typeof series.booksUnreadCount === 'number' && series.booksUnreadCount > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/80 text-white text-[11px] font-medium px-2 py-0.5">
            {series.booksUnreadCount} unread
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-fg line-clamp-2">{seriesTitle(series)}</p>
      <p className="text-[11px] text-muted mt-0.5">
        {typeof series.booksCount === 'number'
          ? `${series.booksCount} ${series.booksCount === 1 ? 'book' : 'books'}`
          : 'Series'}
      </p>
    </button>
  );
}

function Section({
  title,
  subtitle,
  children,
  empty,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  empty?: boolean;
  action?: ReactNode;
}) {
  if (empty) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-fg tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
        {children}
      </div>
    </section>
  );
}

function BookListRow({
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

export function ComicsPage() {
  const { data, currentUser, update } = useApp();
  const memberId = currentUser?.id || data.settings.currentUserId || undefined;
  const memberName = currentUser?.name || 'You';
  const members = data.members || [];
  const others = members.filter((m) => m.id && m.id !== memberId);

  const [tab, setTab] = useState<Tab>('home');
  const [browse, setBrowse] = useState<Browse>({ kind: 'root' });
  const [onDeck, setOnDeck] = useState<KomgaBook[]>([]);
  const [inProgress, setInProgress] = useState<KomgaBook[]>([]);
  const [latest, setLatest] = useState<KomgaBook[]>([]);
  const [recentlyRead, setRecentlyRead] = useState<KomgaBook[]>([]);
  const [series, setSeries] = useState<KomgaSeries[]>([]);
  const [libraries, setLibraries] = useState<KomgaLibrary[]>([]);
  const [collections, setCollections] = useState<KomgaCollection[]>([]);
  const [readlists, setReadlists] = useState<KomgaReadList[]>([]);
  const [detailBooks, setDetailBooks] = useState<KomgaBook[]>([]);
  const [detailSeries, setDetailSeries] = useState<KomgaSeries[]>([]);
  const [detailPage, setDetailPage] = useState(0);
  const [detailHasMore, setDetailHasMore] = useState(false);
  const [detailLoadingMore, setDetailLoadingMore] = useState(false);
  const [libraryLetter, setLibraryLetter] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const detailLoadingMoreRef = useRef(false);
  const [selectedBook, setSelectedBook] = useState<KomgaBook | null>(null);
  const [reading, setReading] = useState<KomgaBook | null>(null);
  const [recommendTarget, setRecommendTarget] = useState<
    | { kind: 'book'; book: KomgaBook }
    | { kind: 'series'; series: KomgaSeries }
    | null
  >(null);
  const [recommendToId, setRecommendToId] = useState('');
  const [recommendMsg, setRecommendMsg] = useState('');
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [recommendFlash, setRecommendFlash] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchBooks, setSearchBooks] = useState<KomgaBook[]>([]);
  const [searchSeries, setSearchSeries] = useState<KomgaSeries[]>([]);
  const [searchFilter, setSearchFilter] = useState<'all' | 'series' | 'books' | 'unread' | 'read'>('all');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesContinue, setSeriesContinue] = useState<KomgaBook | null>(null);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deck, progress, recent, read, s, libs, cols, lists] = await Promise.all([
        komgaOnDeck(16, memberId).catch(() => [] as KomgaBook[]),
        komgaInProgress(16, memberId).catch(() => [] as KomgaBook[]),
        komgaLatestBooks(16, memberId).catch(() => [] as KomgaBook[]),
        komgaRecentlyRead(12, memberId).catch(() => [] as KomgaBook[]),
        komgaSeries({ size: 30, memberId }).catch(() => ({ content: [] as KomgaSeries[] })),
        komgaLibraries(memberId).catch(() => [] as KomgaLibrary[]),
        komgaCollections(memberId).catch(() => [] as KomgaCollection[]),
        komgaReadlists(memberId).catch(() => [] as KomgaReadList[]),
      ]);
      setOnDeck(Array.isArray(deck) ? deck : []);
      setInProgress(Array.isArray(progress) ? progress : []);
      setLatest(Array.isArray(recent) ? recent : []);
      setRecentlyRead(Array.isArray(read) ? read : []);
      setSeries(s?.content || []);
      setLibraries(Array.isArray(libs) ? libs : []);
      setCollections(Array.isArray(cols) ? cols : []);
      setReadlists(Array.isArray(lists) ? lists : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  /** Started books (partial progress) — Komga IN_PROGRESS. */
  const continueBooks = useMemo(() => {
    const seen = new Set<string>();
    const out: KomgaBook[] = [];
    for (const b of inProgress) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      out.push(b);
    }
    return out;
  }, [inProgress]);

  /**
   * On Deck = next unread in a series you've started (book itself not started yet).
   * Exclude anything already shown under Continue Reading.
   */
  const onDeckBooks = useMemo(() => {
    const continuing = new Set(continueBooks.map((b) => b.id));
    const seen = new Set<string>();
    const out: KomgaBook[] = [];
    for (const b of onDeck) {
      if (continuing.has(b.id) || seen.has(b.id)) continue;
      seen.add(b.id);
      out.push(b);
    }
    return out;
  }, [onDeck, continueBooks]);


  const myRecs = useMemo(() => {
    const list = (data.comicRecommendations || []).filter(
      (r) => r.toMemberId === memberId && r.status !== 'dismissed',
    );
    return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [data.comicRecommendations, memberId]);

  const memberById = (id: string) => members.find((m) => m.id === id);

  const sendRecommendation = () => {
    if (!recommendTarget || !memberId || !recommendToId) return;
    const to = members.find((m) => m.id === recommendToId);
    if (!to) return;
    setRecommendBusy(true);
    const id = `crec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const msg = recommendMsg.trim().slice(0, 280);
    const rec: ComicRecommendation = {
      id,
      fromMemberId: memberId,
      toMemberId: recommendToId,
      kind: recommendTarget.kind,
      title:
        recommendTarget.kind === 'book'
          ? bookTitle(recommendTarget.book)
          : seriesTitle(recommendTarget.series),
      komgaBookId: recommendTarget.kind === 'book' ? recommendTarget.book.id : undefined,
      komgaSeriesId:
        recommendTarget.kind === 'series'
          ? recommendTarget.series.id
          : recommendTarget.book.seriesId || undefined,
      message: msg || undefined,
      createdAt: new Date().toISOString(),
      status: 'unread',
    };
    update((d) => ({
      ...d,
      comicRecommendations: [rec, ...(d.comicRecommendations || [])].slice(0, 100),
    }));
    setRecommendBusy(false);
    setRecommendTarget(null);
    setRecommendToId('');
    setRecommendMsg('');
    setRecommendFlash(`Recommended to ${to.name}`);
    window.setTimeout(() => setRecommendFlash(null), 2800);
  };

  const dismissRec = (id: string) => {
    update((d) => ({
      ...d,
      comicRecommendations: (d.comicRecommendations || []).map((r) =>
        r.id === id ? { ...r, status: 'dismissed' as const } : r,
      ),
    }));
  };

  const openRecommendation = async (rec: ComicRecommendation) => {
    update((d) => ({
      ...d,
      comicRecommendations: (d.comicRecommendations || []).map((r) =>
        r.id === rec.id && r.status === 'unread' ? { ...r, status: 'opened' as const } : r,
      ),
    }));
    try {
      if (rec.kind === 'book' && rec.komgaBookId) {
        const b = await komgaBook(rec.komgaBookId, memberId);
        setSelectedBook(b);
        return;
      }
      if (rec.komgaSeriesId) {
        const s = await komgaSeriesDetail(rec.komgaSeriesId, memberId);
        await openSeries(s);
        return;
      }
      if (rec.komgaBookId) {
        const b = await komgaBook(rec.komgaBookId, memberId);
        setSelectedBook(b);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open recommended comic');
    }
  };

  const openSeries = async (s: KomgaSeries) => {
    setBrowse({ kind: 'series', series: s });
    setDetailLoading(true);
    setDetailBooks([]);
    setDetailPage(0);
    setDetailHasMore(false);
    setSeriesContinue(null);
    setLibraryLetter(null);
    try {
      const [detail, page] = await Promise.all([
        komgaSeriesDetail(s.id, memberId).catch(() => s),
        komgaSeriesBooksPage(s.id, { memberId, size: 40, page: 0 }),
      ]);
      const books = page.content || [];
      setBrowse({ kind: 'series', series: detail });
      setDetailBooks(books);
      const totalPages = page.totalPages ?? 1;
      setDetailPage(0);
      setDetailHasMore(totalPages > 1);
      const cont =
        books.find((b) => {
          const pct = bookProgressPercent(b);
          return pct > 0 && pct < 100;
        }) || books.find((b) => bookProgressPercent(b) < 100) || books[0] || null;
      setSeriesContinue(cont);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const openCollection = async (c: KomgaCollection) => {
    setBrowse({ kind: 'collection', collection: c });
    setDetailLoading(true);
    setDetailSeries([]);
    try {
      setDetailSeries(await komgaCollectionSeries(c.id, memberId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const openReadlist = async (r: KomgaReadList) => {
    setBrowse({ kind: 'readlist', readlist: r });
    setDetailLoading(true);
    setDetailBooks([]);
    try {
      setDetailBooks(await komgaReadlistBooks(r.id, memberId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchLibraryPage = async (
    lib: KomgaLibrary,
    page: number,
    letter: string | null,
    append: boolean,
  ) => {
    const result = await komgaSeries({
      size: 40,
      page,
      memberId,
      libraryId: lib.id,
      sort: 'metadata.titleSort,asc',
      searchRegex: letter ? letterSearchRegex(letter) : undefined,
    });
    const content = result?.content || [];
    setDetailSeries((prev) => {
      if (!append) return content;
      const seen = new Set(prev.map((s) => s.id));
      return [...prev, ...content.filter((s) => !seen.has(s.id))];
    });
    setDetailPage(page);
    setDetailHasMore(page + 1 < (result?.totalPages ?? 0));
  };

  const openLibrary = async (lib: KomgaLibrary) => {
    setBrowse({ kind: 'library', library: lib });
    setDetailLoading(true);
    setDetailSeries([]);
    setDetailPage(0);
    setDetailHasMore(false);
    setLibraryLetter(null);
    try {
      await fetchLibraryPage(lib, 0, null, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  /** Letter change = fresh server query for that bucket only (not client filter). */
  const selectLibraryLetter = async (letter: string | null) => {
    if (browse.kind !== 'library') return;
    setLibraryLetter(letter);
    setDetailLoading(true);
    setDetailSeries([]);
    setDetailPage(0);
    setDetailHasMore(false);
    try {
      await fetchLibraryPage(browse.library, 0, letter, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const loadMoreDetail = useCallback(async () => {
    if (detailLoadingMoreRef.current || !detailHasMore || detailLoading) return;
    if (browse.kind !== 'series' && browse.kind !== 'library') return;
    detailLoadingMoreRef.current = true;
    setDetailLoadingMore(true);
    const nextPage = detailPage + 1;
    try {
      if (browse.kind === 'series') {
        const page = await komgaSeriesBooksPage(browse.series.id, {
          memberId,
          size: 40,
          page: nextPage,
        });
        const more = page.content || [];
        setDetailBooks((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          return [...prev, ...more.filter((b) => !seen.has(b.id))];
        });
        setDetailPage(nextPage);
        setDetailHasMore(nextPage + 1 < (page.totalPages ?? 0));
      } else if (browse.kind === 'library') {
        const page = await komgaSeries({
          size: 40,
          page: nextPage,
          memberId,
          libraryId: browse.library.id,
          sort: 'metadata.titleSort,asc',
          searchRegex: libraryLetter ? letterSearchRegex(libraryLetter) : undefined,
        });
        const more = page?.content || [];
        setDetailSeries((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          return [...prev, ...more.filter((s) => !seen.has(s.id))];
        });
        setDetailPage(nextPage);
        setDetailHasMore(nextPage + 1 < (page?.totalPages ?? 0));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      detailLoadingMoreRef.current = false;
      setDetailLoadingMore(false);
    }
  }, [browse, detailHasMore, detailLoading, detailPage, memberId, libraryLetter]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !detailHasMore) return;
    if (browse.kind !== 'series' && browse.kind !== 'library') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreDetail();
      },
      { root: null, rootMargin: '400px', threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [browse.kind, detailHasMore, loadMoreDetail, detailBooks.length, detailSeries.length]);

  const runSearch = async () => {
    const q = search.trim();
    if (!q) {
      setSearchBooks([]);
      setSearchSeries([]);
      return;
    }
    setSearching(true);
    setError(null);
    setTab('search');
    setBrowse({ kind: 'root' });
    try {
      const [booksPage, seriesPage] = await Promise.all([
        komgaBooks({ size: 36, search: q, memberId }),
        komgaSeries({ size: 36, search: q, memberId }),
      ]);
      setSearchBooks(booksPage?.content || []);
      setSearchSeries(seriesPage?.content || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  const filteredSearchBooks = useMemo(() => {
    let list = searchBooks;
    if (searchFilter === 'unread') {
      list = list.filter((b) => bookProgressPercent(b) < 100 && !b.readProgress?.completed);
    } else if (searchFilter === 'read') {
      list = list.filter((b) => bookProgressPercent(b) >= 100 || b.readProgress?.completed);
    }
    return list;
  }, [searchBooks, searchFilter]);

  const openBookDetail = async (book: KomgaBook) => {
    try {
      const full = await komgaBook(book.id, memberId);
      setSelectedBook(full || book);
    } catch {
      setSelectedBook(book);
    }
  };

  const startReading = (book: KomgaBook) => {
    setSelectedBook(null);
    setReading(book);
  };

  const goRoot = () => {
    setBrowse({ kind: 'root' });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'library', label: 'My Library' },
    { id: 'collections', label: 'Collections' },
    { id: 'lists', label: 'Reading Lists' },
    { id: 'search', label: 'Search' },
  ];

  const authors = (b: KomgaBook) =>
    (b.metadata?.authors || [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(', ');

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-5 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2 tracking-tight">
            <BookOpen className="w-7 h-7 text-accent" />
            Comics
          </h1>
          <p className="text-sm text-muted mt-1">
            {memberName}&apos;s library — progress stays with your Komga account
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void loadHome()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      {/* Search bar always available */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search series, books, authors…"
            className="w-full rounded-2xl border border-border bg-input pl-10 pr-3 py-2.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent shadow-sm"
          />
        </div>
        <Button type="submit" disabled={searching}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </Button>
      </form>

      {/* Tabs */}
      {browse.kind === 'root' && (
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors',
                tab === t.id
                  ? 'bg-accent text-accent-ink shadow-sm'
                  : 'text-muted hover:text-fg hover:bg-nav-hover',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-warn bg-warn/10 rounded-xl px-3 py-2">{error}</p>
      )}

      {browse.kind !== 'root' && (
        <button
          type="button"
          onClick={goRoot}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {/* ── Detail views ── */}
      {browse.kind !== 'root' ? (
        <div className="space-y-5">
          {detailLoading ? (
            <div className="flex justify-center py-16 text-muted">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : browse.kind === 'series' ? (
            <>
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <img
                  src={komgaSeriesThumbUrl(browse.series.id, memberId)}
                  alt=""
                  className="w-40 sm:w-48 aspect-[2/3] rounded-2xl object-cover border border-border shadow-lg shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Series</p>
                    <h2 className="text-2xl font-bold text-fg mt-0.5">{seriesTitle(browse.series)}</h2>
                    <p className="text-sm text-muted mt-1">
                      {[
                        browse.series.metadata?.publisher,
                        typeof browse.series.booksCount === 'number'
                          ? `${browse.series.booksCount} books`
                          : null,
                        typeof browse.series.booksUnreadCount === 'number'
                          ? `${browse.series.booksUnreadCount} unread`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {browse.series.metadata?.summary && (
                    <p className="text-sm text-muted leading-relaxed max-w-xl">
                      {browse.series.metadata.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {seriesContinue && (
                      <Button onClick={() => startReading(seriesContinue)}>
                        <Play className="w-4 h-4" />
                        {bookProgressPercent(seriesContinue) > 0 ? 'Continue reading' : 'Start series'}
                      </Button>
                    )}
                    {others.length > 0 && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setRecommendTarget({ kind: 'series', series: browse.series })
                        }
                      >
                        <Share2 className="w-4 h-4" />
                        Recommend
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-fg mb-3">Books · reading order</h3>
                <div className="flex flex-wrap gap-4">
                  {detailBooks.map((b) => (
                    <BookCard
                      key={b.id}
                      book={b}
                      memberId={memberId}
                      onOpen={() => void openBookDetail(b)}
                    />
                  ))}
                </div>
                {detailBooks.length === 0 && (
                  <p className="text-sm text-muted">No books in this series.</p>
                )}
                <div ref={loadMoreRef} className="h-8 flex items-center justify-center mt-4">
                  {detailLoadingMore && <Loader2 className="w-5 h-5 animate-spin text-muted" />}
                  {!detailHasMore && detailBooks.length > 40 && (
                    <span className="text-xs text-muted">All books loaded</span>
                  )}
                </div>
              </div>
            </>
          ) : browse.kind === 'collection' || browse.kind === 'library' ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {browse.kind === 'collection' ? 'Collection' : 'Library'}
                </p>
                <h2 className="text-xl font-bold text-fg mt-0.5">
                  {browse.kind === 'collection' ? browse.collection.name : browse.library.name}
                </h2>
                {browse.kind === 'library' && (
                  <p className="text-xs text-muted mt-1">Pick a letter to load only that group · scroll for more in the group</p>
                )}
              </div>
              {browse.kind === 'library' && (
                <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-page/95 backdrop-blur-sm">
                  <div className="flex flex-wrap gap-1">
                    {['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => {
                      const active = libraryLetter === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() =>
                            void selectLibraryLetter(libraryLetter === letter ? null : letter)
                          }
                          className={
                            'min-w-[1.75rem] h-7 px-1 rounded-lg text-xs font-bold transition-colors ' +
                            (active
                              ? 'bg-accent text-accent-ink'
                              : 'bg-surface-2 text-muted hover:text-fg hover:bg-nav-hover')
                          }
                        >
                          {letter}
                        </button>
                      );
                    })}
                    {libraryLetter && (
                      <button
                        type="button"
                        onClick={() => void selectLibraryLetter(null)}
                        className="h-7 px-2 rounded-lg text-xs font-semibold text-muted hover:text-fg"
                      >
                        All
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-4">
                {detailSeries.map((s) => (
                  <SeriesCard
                    key={s.id}
                    series={s}
                    memberId={memberId}
                    onOpen={() => void openSeries(s)}
                  />
                ))}
                {!detailLoading && detailSeries.length === 0 && (
                  <p className="text-sm text-muted">
                    {libraryLetter
                      ? `No series starting with ${libraryLetter} in this library.`
                      : 'Nothing here yet.'}
                  </p>
                )}
              </div>
              {browse.kind === 'library' && (
                <div ref={loadMoreRef} className="h-8 flex items-center justify-center mt-2">
                  {detailLoadingMore && <Loader2 className="w-5 h-5 animate-spin text-muted" />}
                  {!detailHasMore && detailSeries.length > 0 && (
                    <span className="text-xs text-muted">{detailSeries.length} series</span>
                  )}
                </div>
              )}
            </>
          ) : browse.kind === 'readlist' ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Reading list
                  </p>
                  <h2 className="text-xl font-bold text-fg mt-0.5">{browse.readlist.name}</h2>
                  <p className="text-sm text-muted mt-1">{detailBooks.length} books · ordered</p>
                </div>
                {detailBooks[0] && (
                  <Button onClick={() => startReading(detailBooks[0]!)}>
                    <Play className="w-4 h-4" />
                    Start reading
                  </Button>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-elevated divide-y divide-border overflow-hidden">
                {detailBooks.map((b, i) => (
                  <BookListRow
                    key={b.id}
                    book={b}
                    memberId={memberId}
                    index={i}
                    onOpen={() => void openBookDetail(b)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20 text-muted">
          <Loader2 className="w-9 h-9 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Home ── */}
          {tab === 'home' && (
            <div className="space-y-10">
              <Section
                title="Continue reading"
                subtitle={continueBooks.length ? `Comics you've started — pick up where you left off` : undefined}
                empty={continueBooks.length === 0}
              >
                {continueBooks.map((b) => (
                  <div key={b.id} className="snap-start">
                    <BookCard
                      book={b}
                      memberId={memberId}
                      hero
                      onOpen={() => void openBookDetail(b)}
                    />
                  </div>
                ))}
              </Section>

              <Section
                title="On deck"
                subtitle={
                  onDeckBooks.length
                    ? 'Next unread in series you\'ve started (not opened yet)'
                    : undefined
                }
                empty={onDeckBooks.length === 0}
              >
                {onDeckBooks.map((b) => (
                  <div key={b.id} className="snap-start">
                    <BookCard
                      book={b}
                      memberId={memberId}
                      hero
                      onOpen={() => void openBookDetail(b)}
                    />
                  </div>
                ))}
              </Section>

              {myRecs.length > 0 && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-fg tracking-tight">
                      Recommended for you
                    </h2>
                    <p className="text-xs text-muted mt-0.5">From your family</p>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                    {myRecs.map((rec) => {
                      const from = memberById(rec.fromMemberId);
                      const thumb =
                        rec.kind === 'book' && rec.komgaBookId
                          ? komgaBookThumbUrl(rec.komgaBookId, memberId)
                          : rec.komgaSeriesId
                            ? komgaSeriesThumbUrl(rec.komgaSeriesId, memberId)
                            : '';
                      return (
                        <div
                          key={rec.id}
                          className="shrink-0 w-[11rem] sm:w-[12rem] rounded-2xl border border-border bg-elevated p-2.5 shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => void openRecommendation(rec)}
                            className="w-full text-left group"
                          >
                            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt=""
                                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted">
                                  <BookOpen className="w-8 h-8 opacity-40" />
                                </div>
                              )}
                              {rec.status === 'unread' && (
                                <span className="absolute top-2 left-2 rounded-full bg-accent text-accent-ink text-[10px] font-bold px-1.5 py-0.5">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm font-semibold text-fg line-clamp-2">
                              {rec.title}
                            </p>
                            <p className="text-[11px] text-muted mt-0.5">
                              {from?.name || 'Family'} recommended
                            </p>
                            {rec.message && (
                              <p className="text-[11px] text-fg/80 mt-1 line-clamp-2 italic">
                                “{rec.message}”
                              </p>
                            )}
                          </button>
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => void openRecommendation(rec)}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => dismissRec(rec.id)}
                              title="Dismiss"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <Section title="Recently added" empty={latest.length === 0}>
                {latest.map((b) => (
                  <div key={b.id} className="snap-start">
                    <BookCard book={b} memberId={memberId} onOpen={() => void openBookDetail(b)} />
                  </div>
                ))}
              </Section>

              <Section title="Recently read" empty={recentlyRead.length === 0}>
                {recentlyRead.map((b) => (
                  <div key={b.id} className="snap-start">
                    <BookCard book={b} memberId={memberId} onOpen={() => void openBookDetail(b)} />
                  </div>
                ))}
              </Section>

              {collections.length > 0 && (
                <Section title="Collections">
                  {collections.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void openCollection(c)}
                      className={cn('snap-start shrink-0 text-left group', COVER_SERIES)}
                    >
                      <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-surface-2 border border-border shadow-md">
                        <img
                          src={komgaCollectionThumbUrl(c.id, memberId)}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-fg line-clamp-2">{c.name}</p>
                      <p className="text-[11px] text-muted">Collection</p>
                    </button>
                  ))}
                </Section>
              )}

              {readlists.length > 0 && (
                <Section title="Reading lists">
                  {readlists.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void openReadlist(r)}
                      className={cn('snap-start shrink-0 text-left group', COVER_SERIES)}
                    >
                      <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-surface-2 border border-border shadow-md">
                        <img
                          src={komgaReadlistThumbUrl(r.id, memberId)}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-fg line-clamp-2">{r.name}</p>
                      <p className="text-[11px] text-muted">Reading list</p>
                    </button>
                  ))}
                </Section>
              )}

              <Section title="Series" empty={series.length === 0}>
                {series.map((s) => (
                  <div key={s.id} className="snap-start">
                    <SeriesCard series={s} memberId={memberId} onOpen={() => void openSeries(s)} />
                  </div>
                ))}
              </Section>

              {!continueBooks.length && !onDeckBooks.length && !latest.length && !series.length && !error && (
                <Card className="p-10 text-center space-y-2">
                  <BookOpen className="w-10 h-10 text-muted mx-auto opacity-50" />
                  <p className="text-sm text-muted">
                    No comics visible for this account. Check Komga library access and the
                    per-member API key for this profile.
                  </p>
                </Card>
              )}
            </div>
          )}

          {/* ── My Library ── */}
          {tab === 'library' && (
            <div className="space-y-8">
              {libraries.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {libraries.map((lib) => (
                    <Button
                      key={lib.id}
                      size="sm"
                      variant="secondary"
                      onClick={() => void openLibrary(lib)}
                    >
                      <Library className="w-3.5 h-3.5" />
                      {lib.name}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-4">
                {series.map((s) => (
                  <SeriesCard
                    key={s.id}
                    series={s}
                    memberId={memberId}
                    onOpen={() => void openSeries(s)}
                  />
                ))}
              </div>
              {series.length === 0 && (
                <p className="text-sm text-muted">No series in your accessible libraries.</p>
              )}
            </div>
          )}

          {/* ── Collections ── */}
          {tab === 'collections' && (
            <div className="flex flex-wrap gap-4">
              {collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void openCollection(c)}
                  className={cn('text-left group', COVER_SERIES)}
                >
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-surface-2 border border-border shadow-md">
                    <img
                      src={komgaCollectionThumbUrl(c.id, memberId)}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-fg line-clamp-2">{c.name}</p>
                </button>
              ))}
              {collections.length === 0 && (
                <p className="text-sm text-muted">No collections yet — create them in Komga.</p>
              )}
            </div>
          )}

          {/* ── Reading lists ── */}
          {tab === 'lists' && (
            <div className="space-y-3">
              {readlists.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void openReadlist(r)}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl border border-border bg-elevated hover:border-accent/40 text-left transition-colors"
                >
                  <img
                    src={komgaReadlistThumbUrl(r.id, memberId)}
                    alt=""
                    className="w-16 h-24 rounded-lg object-cover border border-border shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-fg">{r.name}</p>
                    <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                      <List className="w-3.5 h-3.5" />
                      Reading list
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-accent shrink-0">Open</span>
                </button>
              ))}
              {readlists.length === 0 && (
                <p className="text-sm text-muted">No reading lists yet — create them in Komga.</p>
              )}
            </div>
          )}

          {/* ── Search ── */}
          {tab === 'search' && (
            <div className="space-y-8">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', 'All'],
                    ['series', 'Series'],
                    ['books', 'Books'],
                    ['unread', 'Unread'],
                    ['read', 'Read'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSearchFilter(id)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold',
                      searchFilter === id
                        ? 'bg-accent text-accent-ink'
                        : 'bg-surface-2 text-muted hover:text-fg',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {!search.trim() && (
                <p className="text-sm text-muted">Type a title, author, or tag above and hit Search.</p>
              )}

              {(searchFilter === 'all' || searchFilter === 'series') && searchSeries.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-fg uppercase tracking-wide">Series</h2>
                  <div className="flex flex-wrap gap-4">
                    {searchSeries.map((s) => (
                      <SeriesCard
                        key={s.id}
                        series={s}
                        memberId={memberId}
                        onOpen={() => void openSeries(s)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {(searchFilter === 'all' ||
                searchFilter === 'books' ||
                searchFilter === 'unread' ||
                searchFilter === 'read') &&
                filteredSearchBooks.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-bold text-fg uppercase tracking-wide">Books</h2>
                    <div className="flex flex-wrap gap-4">
                      {filteredSearchBooks.map((b) => (
                        <BookCard
                          key={b.id}
                          book={b}
                          memberId={memberId}
                          onOpen={() => void openBookDetail(b)}
                        />
                      ))}
                    </div>
                  </div>
                )}

              {search.trim() &&
                !searching &&
                searchSeries.length === 0 &&
                filteredSearchBooks.length === 0 && (
                  <p className="text-sm text-muted">No results for “{search.trim()}”.</p>
                )}
            </div>
          )}
        </>
      )}

      {/* Book detail modal */}
      <Modal
        open={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        title={selectedBook ? bookTitle(selectedBook) : ''}
        size="lg"
      >
        {selectedBook && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <img
                src={komgaBookThumbUrl(selectedBook.id, memberId)}
                alt=""
                className="w-32 rounded-xl border border-border object-cover aspect-[2/3] shadow-md"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                {selectedBook.seriesTitle && (
                  <p className="text-sm text-muted">{selectedBook.seriesTitle}</p>
                )}
                {authors(selectedBook) && (
                  <p className="text-sm text-fg">{authors(selectedBook)}</p>
                )}
                {typeof selectedBook.media?.pagesCount === 'number' && (
                  <p className="text-xs text-muted">{selectedBook.media.pagesCount} pages</p>
                )}
                <StatusPill book={selectedBook} />
                {bookProgressPercent(selectedBook) > 0 &&
                  bookProgressPercent(selectedBook) < 100 && (
                    <div className="pt-1 max-w-[12rem]">
                      <ProgressBar pct={bookProgressPercent(selectedBook)} className="h-1.5" />
                      <p className="text-[11px] text-muted mt-1">
                        Page {selectedBook.readProgress?.page ?? '—'} ·{' '}
                        {Math.round(bookProgressPercent(selectedBook))}%
                      </p>
                    </div>
                  )}
              </div>
            </div>
            {selectedBook.metadata?.summary && (
              <p className="text-sm text-muted leading-relaxed">{selectedBook.metadata.summary}</p>
            )}
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={() => startReading(selectedBook)}>
                <BookOpen className="w-4 h-4" />
                {bookProgressPercent(selectedBook) > 0 && bookProgressPercent(selectedBook) < 100
                  ? 'Continue reading'
                  : 'Read'}
              </Button>
              {others.length > 0 && (
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => setRecommendTarget({ kind: 'book', book: selectedBook })}
                >
                  <Share2 className="w-4 h-4" />
                  Recommend to…
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {recommendFlash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-2xl bg-elevated border border-border shadow-lg px-4 py-2.5 text-sm font-semibold text-fg">
          ✓ {recommendFlash}
        </div>
      )}

      <Modal
        open={!!recommendTarget}
        onClose={() => {
          if (recommendBusy) return;
          setRecommendTarget(null);
          setRecommendMsg('');
          setRecommendToId('');
        }}
        title="Recommend this comic"
        size="md"
      >
        {recommendTarget && (
          <div className="space-y-4">
            <p className="text-sm text-fg font-medium">
              {recommendTarget.kind === 'book'
                ? bookTitle(recommendTarget.book)
                : seriesTitle(recommendTarget.series)}
            </p>
            <div>
              <p className="text-xs font-semibold text-muted mb-2">Who would you recommend it to?</p>
              <div className="space-y-1.5">
                {others.map((m) => (
                  <label
                    key={m.id}
                    className={
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ' +
                      (recommendToId === m.id
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:bg-nav-hover')
                    }
                  >
                    <input
                      type="radio"
                      name="rec-to"
                      className="accent-current"
                      checked={recommendToId === m.id}
                      onChange={() => setRecommendToId(m.id)}
                    />
                    <span className="text-sm font-medium text-fg">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted">Why? (optional)</label>
              <textarea
                value={recommendMsg}
                onChange={(e) => setRecommendMsg(e.target.value.slice(0, 280))}
                rows={3}
                placeholder="I think you'll like this…"
                className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-accent resize-none"
              />
              <p className="text-[11px] text-muted mt-1 text-right">{recommendMsg.length}/280</p>
            </div>
            <Button
              className="w-full"
              disabled={!recommendToId || recommendBusy}
              onClick={sendRecommendation}
            >
              {recommendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Recommend'}
            </Button>
          </div>
        )}
      </Modal>

      {reading && (
        <ComicReader
          book={reading}
          memberId={memberId}
          onClose={() => {
            setReading(null);
            void loadHome();
          }}
          onOpenBook={(b) => setReading(b)}
        />
      )}
    </div>
  );
}
