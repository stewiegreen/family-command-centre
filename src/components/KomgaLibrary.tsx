import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, BookOpen, Check, ExternalLink, RefreshCw, Search, Circle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { ComicReader } from './ComicReader';
import {
  bookProgressPercent,
  bookTitle,
  komgaBook,
  komgaBookThumbUrl,
  komgaBookWebLink,
  komgaBooks,
  komgaInProgress,
  komgaLatestBooks,
  komgaMarkRead,
  komgaMarkUnread,
  komgaOnDeck,
  komgaSeries,
  komgaSeriesBooks,
  komgaSeriesDetail,
  komgaSeriesThumbUrl,
  resolveKomgaWebUrl,
  seriesTitle,
  type KomgaBook,
  type KomgaSeries,
} from '../lib/komga';

const COVER = 'w-28 sm:w-32';

function Cover({ book, memberId, onClick }: { book: KomgaBook; memberId?: string; onClick: () => void }) {
  const pct = bookProgressPercent(book);
  return (
    <button type="button" onClick={onClick} className={`shrink-0 ${COVER} text-left group`}>
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
        <img
          src={komgaBookThumbUrl(book.id, memberId)}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
      {pct > 0 && pct < 100 && <p className="text-[11px] text-muted">{Math.round(pct)}%</p>}
    </button>
  );
}

function SeriesCover({ series, memberId, onClick }: { series: KomgaSeries; memberId?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-36 sm:w-40 shrink-0 text-left group">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
        <img
          src={komgaSeriesThumbUrl(series.id, memberId)}
          alt=""
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {typeof series.booksUnreadCount === 'number' && series.booksUnreadCount > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/75 text-white text-[11px] px-2 py-0.5">
            {series.booksUnreadCount} unread
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium text-fg line-clamp-2">{seriesTitle(series)}</p>
      {typeof series.booksCount === 'number' && (
        <p className="text-[11px] text-muted">{series.booksCount} {series.booksCount === 1 ? 'book' : 'books'}</p>
      )}
    </button>
  );
}

export function KomgaLibrary() {
  const { data, currentUser } = useApp();
  const memberId = currentUser?.id || data.settings.currentUserId || undefined;
  const webUrl = resolveKomgaWebUrl(data.settings);

  const [onDeck, setOnDeck] = useState<KomgaBook[]>([]);
  const [inProgress, setInProgress] = useState<KomgaBook[]>([]);
  const [latest, setLatest] = useState<KomgaBook[]>([]);
  const [series, setSeries] = useState<KomgaSeries[]>([]);
  const [seriesTotal, setSeriesTotal] = useState(0);
  const [selectedSeries, setSelectedSeries] = useState<KomgaSeries | null>(null);
  const [seriesBooks, setSeriesBooks] = useState<KomgaBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<KomgaBook | null>(null);
  const [reading, setReading] = useState<KomgaBook | null>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deck, progress, recent, s] = await Promise.all([
        komgaOnDeck(8, memberId),
        komgaInProgress(8, memberId),
        komgaLatestBooks(8, memberId),
        komgaSeries({ size: 24, memberId }),
      ]);
      setOnDeck(deck);
      setInProgress(progress);
      setLatest(recent);
      setSeries(s.content || []);
      setSeriesTotal(s.totalElements || s.content?.length || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to Komga');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { void loadHome(); }, [loadHome]);

  const runSearch = async () => {
    setSearching(true);
    setError(null);
    try {
      if (!search.trim()) {
        await loadHome();
        return;
      }
      const [s, b] = await Promise.all([
        komgaSeries({ size: 24, search: search.trim(), memberId }),
        komgaBooks({ size: 24, search: search.trim(), memberId }),
      ]);
      setSeries(s.content || []);
      setSeriesTotal(s.totalElements || s.content?.length || 0);
      setLatest(b.content || []);
      setOnDeck([]);
      setInProgress([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const openSeries = async (s: KomgaSeries) => {
    setSelectedSeries(s);
    setSeriesLoading(true);
    try {
      const [detail, books] = await Promise.all([
        komgaSeriesDetail(s.id, memberId),
        komgaSeriesBooks(s.id, memberId),
      ]);
      setSelectedSeries(detail);
      setSeriesBooks(books);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load series');
      setSeriesBooks([]);
    } finally {
      setSeriesLoading(false);
    }
  };

  const openBook = async (b: KomgaBook) => {
    try {
      setSelectedBook(await komgaBook(b.id, memberId));
    } catch {
      setSelectedBook(b);
    }
  };

  const markRead = async (b: KomgaBook, read: boolean) => {
    try {
      if (read) await komgaMarkRead(b, memberId);
      else await komgaMarkUnread(b.id, memberId);
      const refreshed = await komgaBook(b.id, memberId);
      setSelectedBook(refreshed);
      if (selectedSeries) {
        setSeriesBooks((items) => items.map((x) => x.id === refreshed.id ? refreshed : x));
      }
      void loadHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update reading status');
    }
  };

  const title = selectedSeries ? seriesTitle(selectedSeries) : 'Books';

  return (
    <Card className="space-y-5 !p-4 sm:!p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selectedSeries ? (
            <button type="button" onClick={() => setSelectedSeries(null)} className="p-2 rounded-xl hover:bg-nav-hover shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-amber-400" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-lg truncate">{title}</h2>
            {!selectedSeries && <p className="text-xs text-muted">Your Komga library, inside GreenHQ</p>}
          </div>
        </div>
        {webUrl && !selectedSeries && (
          <a href={webUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">Open Komga <ExternalLink className="w-3.5 h-3.5" /></Button>
          </a>
        )}
        <Button size="sm" variant="secondary" onClick={() => void loadHome()} disabled={loading || !!selectedSeries}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">{error}</div>
      )}

      {selectedSeries ? (
        <div className="space-y-5">
          <div className="flex gap-4">
            <img
              src={komgaSeriesThumbUrl(selectedSeries.id, memberId)}
              alt=""
              className="w-28 sm:w-36 aspect-[2/3] rounded-xl object-cover border border-border shrink-0"
            />
            <div className="min-w-0 space-y-2">
              <h3 className="text-xl font-bold">{seriesTitle(selectedSeries)}</h3>
              {selectedSeries.metadata?.summary && (
                <p className="text-sm text-muted line-clamp-5">{selectedSeries.metadata.summary}</p>
              )}
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                {typeof selectedSeries.booksCount === 'number' && <span>{selectedSeries.booksCount} books</span>}
                {typeof selectedSeries.booksUnreadCount === 'number' && <span>{selectedSeries.booksUnreadCount} unread</span>}
                {selectedSeries.metadata?.publisher && <span>{selectedSeries.metadata.publisher}</span>}
              </div>
              {webUrl && (
                <a href={`${webUrl}/series/${encodeURIComponent(selectedSeries.id)}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="secondary">Open in Komga <ExternalLink className="w-3.5 h-3.5" /></Button>
                </a>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Books in this series</h3>
            {seriesLoading ? <p className="text-sm text-muted py-6 text-center">Loading books…</p> :
              seriesBooks.length === 0 ? <p className="text-sm text-muted py-6 text-center">No books found.</p> :
              <div className="flex flex-wrap gap-x-4 gap-y-5">
                {seriesBooks.map((b) => <Cover key={b.id} book={b} memberId={memberId} onClick={() => void openBook(b)} />)}
              </div>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
                placeholder="Search books and series…"
                className="w-full h-10 rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm text-fg outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <Button onClick={() => void runSearch()} disabled={searching}>
              <Search className="w-4 h-4" /> <span className="hidden sm:inline">Search</span>
            </Button>
          </div>

          {loading && !onDeck.length && !inProgress.length && !latest.length && !series.length ? (
            <p className="text-sm text-muted py-8 text-center">Loading your library…</p>
          ) : (
            <div className="space-y-6">
              {onDeck.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-3">On Deck</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2">{onDeck.map((b) =>
                    <Cover key={b.id} book={b} memberId={memberId} onClick={() => void openBook(b)} />)}</div>
                </section>
              )}

              {inProgress.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-3">Continue Reading</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2">{inProgress.map((b) =>
                    <Cover key={b.id} book={b} memberId={memberId} onClick={() => void openBook(b)} />)}</div>
                </section>
              )}

              {latest.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-3">{search ? 'Search Results' : 'Recently Added'}</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2">{latest.map((b) =>
                    <Cover key={b.id} book={b} memberId={memberId} onClick={() => void openBook(b)} />)}</div>
                </section>
              )}

              {!search && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Series</h3>
                    <span className="text-xs text-muted">{seriesTotal} series</span>
                  </div>
                  {series.length === 0 ? <p className="text-sm text-muted">No series found.</p> :
                    <div className="flex gap-4 overflow-x-auto pb-2">{series.map((s) =>
                      <SeriesCover key={s.id} series={s} memberId={memberId} onClick={() => void openSeries(s)} />)}</div>}
                </section>
              )}

              {search && latest.length === 0 && series.length === 0 && (
                <div className="py-8 text-center text-sm text-muted">Nothing found.</div>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        title={selectedBook ? bookTitle(selectedBook) : 'Book'}
        size="lg"
      >
        {selectedBook && (
          <div className="flex flex-col sm:flex-row gap-5">
            <img src={komgaBookThumbUrl(selectedBook.id, memberId)} alt="" className="w-40 sm:w-48 aspect-[2/3] rounded-xl object-cover border border-border mx-auto sm:mx-0" />
            <div className="flex-1 min-w-0 space-y-3">
              {selectedBook.metadata?.summary && <p className="text-sm text-muted">{selectedBook.metadata.summary}</p>}
              <div className="text-sm text-muted space-y-1">
                {selectedBook.seriesTitle && <p>Series: <span className="text-fg">{selectedBook.seriesTitle}</span></p>}
                {selectedBook.media?.pagesCount && <p>{selectedBook.media.pagesCount} pages</p>}
                {selectedBook.readProgress?.completed ? <p className="text-emerald-500 font-medium">Finished</p> :
                  bookProgressPercent(selectedBook) > 0 ? <p>{Math.round(bookProgressPercent(selectedBook))}% complete</p> :
                  <p>Unread</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setReading(selectedBook); setSelectedBook(null); }}>
                  <BookOpen className="w-4 h-4" /> {bookProgressPercent(selectedBook) > 0 && bookProgressPercent(selectedBook) < 100 ? 'Continue' : 'Read'}
                </Button>
                {selectedBook.readProgress?.completed ? (
                  <Button variant="secondary" onClick={() => void markRead(selectedBook, false)}><Circle className="w-4 h-4" /> Mark unread</Button>
                ) : (
                  <Button variant="secondary" onClick={() => void markRead(selectedBook, true)}><Check className="w-4 h-4" /> Mark read</Button>
                )}
                {webUrl && (
                  <a href={komgaBookWebLink(webUrl, selectedBook.id)} target="_blank" rel="noreferrer">
                    <Button variant="secondary">Open in Komga <ExternalLink className="w-4 h-4" /></Button>
                  </a>
                )}
              </div>
            </div>
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
            if (reading) void komgaBook(reading.id, memberId).then(setSelectedBook).catch(() => {});
          }}
          onOpenBook={(b) => setReading(b)}
        />
      )}
    </Card>
  );
}
