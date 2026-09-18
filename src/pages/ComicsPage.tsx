/**
 * Phase 1 — Comics library (Komga client UI).
 * Browse only + open existing in-app reader. No Phase 2–5 features.
 * Komga remains source of truth; per-member API key via memberId on the proxy.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Library,
  List,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { ComicReader } from '../components/ComicReader';
import {
  bookProgressPercent,
  bookTitle,
  komgaBook,
  komgaBookThumbUrl,
  komgaCollectionSeries,
  komgaCollectionThumbUrl,
  komgaCollections,
  komgaInProgress,
  komgaLatestBooks,
  komgaLibraries,
  komgaBooks,
  komgaOnDeck,
  komgaReadlistBooks,
  komgaReadlistThumbUrl,
  komgaReadlists,
  komgaRecentlyRead,
  komgaSeries,
  komgaSeriesBooks,
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

type Browse =
  | { kind: 'home' }
  | { kind: 'series'; series: KomgaSeries }
  | { kind: 'collection'; collection: KomgaCollection }
  | { kind: 'readlist'; readlist: KomgaReadList }
  | { kind: 'library'; library: KomgaLibrary };

function BookCover({
  book,
  memberId,
  onClick,
  wide,
}: {
  book: KomgaBook;
  memberId?: string;
  onClick: () => void;
  wide?: boolean;
}) {
  const pct = bookProgressPercent(book);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('shrink-0 text-left group', wide ? 'w-32 sm:w-36' : 'w-28 sm:w-32')}
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
        <img
          src={komgaBookThumbUrl(book.id, memberId)}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {pct > 0 && pct < 100 && (
          <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/50">
            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
          </div>
        )}
        {pct === 100 && (
          <div className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white p-1 shadow">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium text-fg line-clamp-2 leading-snug">{bookTitle(book)}</p>
      {pct > 0 && pct < 100 && (
        <p className="text-[11px] text-muted">{Math.round(pct)}%</p>
      )}
    </button>
  );
}

function SeriesCover({
  series,
  memberId,
  onClick,
}: {
  series: KomgaSeries;
  memberId?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-36 sm:w-40 shrink-0 text-left group">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
        <img
          src={komgaSeriesThumbUrl(series.id, memberId)}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {typeof series.booksUnreadCount === 'number' && series.booksUnreadCount > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/75 text-white text-[11px] px-2 py-0.5">
            {series.booksUnreadCount} unread
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium text-fg line-clamp-2">{seriesTitle(series)}</p>
      {typeof series.booksCount === 'number' && (
        <p className="text-[11px] text-muted">
          {series.booksCount} {series.booksCount === 1 ? 'book' : 'books'}
        </p>
      )}
    </button>
  );
}

function Row({
  title,
  icon,
  children,
  empty,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-fg flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">{children}</div>
    </section>
  );
}

export function ComicsPage() {
  const { data, currentUser } = useApp();
  const memberId = currentUser?.id || data.settings.currentUserId || undefined;

  const [browse, setBrowse] = useState<Browse>({ kind: 'home' });
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
  const [selectedBook, setSelectedBook] = useState<KomgaBook | null>(null);
  const [reading, setReading] = useState<KomgaBook | null>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deck, progress, recent, read, s, libs, cols, lists] = await Promise.all([
        komgaOnDeck(12, memberId).catch(() => [] as KomgaBook[]),
        komgaInProgress(12, memberId).catch(() => [] as KomgaBook[]),
        komgaLatestBooks(12, memberId).catch(() => [] as KomgaBook[]),
        komgaRecentlyRead(12, memberId).catch(() => [] as KomgaBook[]),
        komgaSeries({ size: 24, memberId }).catch(() => ({ content: [] as KomgaSeries[] })),
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

  const openSeries = async (s: KomgaSeries) => {
    setBrowse({ kind: 'series', series: s });
    setDetailLoading(true);
    setDetailBooks([]);
    try {
      const [detail, books] = await Promise.all([
        komgaSeriesDetail(s.id, memberId).catch(() => s),
        komgaSeriesBooks(s.id, memberId),
      ]);
      setBrowse({ kind: 'series', series: detail });
      setDetailBooks(books);
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
      const list = await komgaCollectionSeries(c.id, memberId);
      setDetailSeries(list);
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
      const books = await komgaReadlistBooks(r.id, memberId);
      setDetailBooks(books);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const openLibrary = async (lib: KomgaLibrary) => {
    setBrowse({ kind: 'library', library: lib });
    setDetailLoading(true);
    setDetailSeries([]);
    try {
      const page = await komgaSeries({ size: 48, memberId, libraryId: lib.id });
      setDetailSeries(page?.content || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const runSearch = async () => {
    const q = search.trim();
    if (!q) {
      void loadHome();
      setBrowse({ kind: 'home' });
      return;
    }
    setSearching(true);
    setError(null);
    setBrowse({ kind: 'home' });
    try {
      const [booksPage, seriesPage] = await Promise.all([
        komgaBooks({ size: 24, search: q, memberId }),
        komgaSeries({ size: 24, search: q, memberId }),
      ]);
      setLatest(booksPage?.content || []);
      setSeries(seriesPage?.content || []);
      setOnDeck([]);
      setInProgress([]);
      setRecentlyRead([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  const openBookDetail = async (book: KomgaBook) => {
    try {
      const full = await komgaBook(book.id, memberId);
      setSelectedBook(full || book);
    } catch {
      setSelectedBook(book);
    }
  };

  const goHome = () => {
    setBrowse({ kind: 'home' });
    void loadHome();
  };

  const authors = (b: KomgaBook) =>
    (b.metadata?.authors || [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(', ');

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-fg flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-accent" />
            Comics
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Your Komga library — permissions and progress stay on your account.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void loadHome()}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

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
            placeholder="Search series, books…"
            className="w-full rounded-xl border border-border bg-input pl-9 pr-3 py-2.5 text-sm text-fg placeholder:text-muted outline-none focus:border-accent"
          />
        </div>
        <Button type="submit" disabled={searching}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-warn bg-warn/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {browse.kind !== 'home' && (
        <button
          type="button"
          onClick={goHome}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to library
        </button>
      )}

      {loading && browse.kind === 'home' ? (
        <div className="flex justify-center py-16 text-muted">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : browse.kind === 'home' ? (
        <div className="space-y-8">
          <Row title="Continue reading" empty={onDeck.length === 0}>
            {onDeck.map((b) => (
              <BookCover key={b.id} book={b} memberId={memberId} onClick={() => void openBookDetail(b)} />
            ))}
          </Row>

          <Row title="In progress" empty={inProgress.length === 0}>
            {inProgress.map((b) => (
              <BookCover key={b.id} book={b} memberId={memberId} onClick={() => void openBookDetail(b)} />
            ))}
          </Row>

          <Row title="Recently added" empty={latest.length === 0}>
            {latest.map((b) => (
              <BookCover key={b.id} book={b} memberId={memberId} onClick={() => void openBookDetail(b)} />
            ))}
          </Row>

          <Row title="Recently read" empty={recentlyRead.length === 0}>
            {recentlyRead.map((b) => (
              <BookCover key={b.id} book={b} memberId={memberId} onClick={() => void openBookDetail(b)} />
            ))}
          </Row>

          {libraries.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2">
                <Library className="w-4 h-4 text-accent" />
                Libraries
              </h2>
              <div className="flex flex-wrap gap-2">
                {libraries.map((lib) => (
                  <Button
                    key={lib.id}
                    size="sm"
                    variant="secondary"
                    onClick={() => void openLibrary(lib)}
                  >
                    {lib.name}
                  </Button>
                ))}
              </div>
            </section>
          )}

          <Row title="Series" empty={series.length === 0}>
            {series.map((s) => (
              <SeriesCover
                key={s.id}
                series={s}
                memberId={memberId}
                onClick={() => void openSeries(s)}
              />
            ))}
          </Row>

          {collections.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2">
                <List className="w-4 h-4 text-accent" />
                Collections
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void openCollection(c)}
                    className="w-40 shrink-0 text-left group"
                  >
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border">
                      <img
                        src={komgaCollectionThumbUrl(c.id, memberId)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-fg line-clamp-2">{c.name}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {readlists.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-fg flex items-center gap-2">
                <List className="w-4 h-4 text-accent" />
                Readlists
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {readlists.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => void openReadlist(r)}
                    className="w-40 shrink-0 text-left group"
                  >
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border">
                      <img
                        src={komgaReadlistThumbUrl(r.id, memberId)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-fg line-clamp-2">{r.name}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!loading &&
            onDeck.length === 0 &&
            latest.length === 0 &&
            series.length === 0 &&
            !error && (
              <Card className="p-8 text-center text-muted text-sm">
                No comics visible for this account. Check Komga library access and that a
                per-member API key is set for your profile.
              </Card>
            )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-fg">
              {browse.kind === 'series' && seriesTitle(browse.series)}
              {browse.kind === 'collection' && browse.collection.name}
              {browse.kind === 'readlist' && browse.readlist.name}
              {browse.kind === 'library' && browse.library.name}
            </h2>
            {browse.kind === 'series' && browse.series.metadata?.summary && (
              <p className="text-sm text-muted mt-1 max-w-2xl">{browse.series.metadata.summary}</p>
            )}
            {browse.kind === 'series' && (
              <p className="text-xs text-muted mt-1">
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
            )}
          </div>

          {detailLoading ? (
            <div className="flex justify-center py-12 text-muted">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
          ) : browse.kind === 'collection' || browse.kind === 'library' ? (
            <div className="flex flex-wrap gap-3">
              {detailSeries.map((s) => (
                <SeriesCover
                  key={s.id}
                  series={s}
                  memberId={memberId}
                  onClick={() => void openSeries(s)}
                />
              ))}
              {detailSeries.length === 0 && (
                <p className="text-sm text-muted">Nothing here yet.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {detailBooks.map((b) => (
                <BookCover
                  key={b.id}
                  book={b}
                  memberId={memberId}
                  onClick={() => void openBookDetail(b)}
                />
              ))}
              {detailBooks.length === 0 && (
                <p className="text-sm text-muted">No books found.</p>
              )}
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        title={selectedBook ? bookTitle(selectedBook) : ''}
      >
        {selectedBook && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <img
                src={komgaBookThumbUrl(selectedBook.id, memberId)}
                alt=""
                className="w-28 rounded-lg border border-border object-cover aspect-[2/3]"
              />
              <div className="min-w-0 flex-1 space-y-1">
                {selectedBook.seriesTitle && (
                  <p className="text-sm text-muted">{selectedBook.seriesTitle}</p>
                )}
                {authors(selectedBook) && (
                  <p className="text-sm text-fg">{authors(selectedBook)}</p>
                )}
                {typeof selectedBook.media?.pagesCount === 'number' && (
                  <p className="text-xs text-muted">{selectedBook.media.pagesCount} pages</p>
                )}
                {bookProgressPercent(selectedBook) > 0 && (
                  <p className="text-xs text-muted">
                    {Math.round(bookProgressPercent(selectedBook))}% read
                    {selectedBook.readProgress?.completed ? ' · Finished' : ''}
                  </p>
                )}
              </div>
            </div>
            {selectedBook.metadata?.summary && (
              <p className="text-sm text-muted leading-relaxed">{selectedBook.metadata.summary}</p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                setReading(selectedBook);
                setSelectedBook(null);
              }}
            >
              <BookOpen className="w-4 h-4" />
              {bookProgressPercent(selectedBook) > 0 && bookProgressPercent(selectedBook) < 100
                ? 'Continue reading'
                : 'Read'}
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
