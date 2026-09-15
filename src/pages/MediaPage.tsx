import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  Film,
  Library,
  Link2Off,
  List,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import {
  displayTitle,
  embyImageUrl,
  embyPublicInfo,
  embyResume,
  embyViews,
  embyWebLibraryLink,
  openEmbyItem,
  playedPercent,
  resolveEmbyWebUrl,
  type EmbyItem,
  type EmbyView,
} from '../lib/emby';
import {
  bookProgressPercent,
  bookTitle,
  komgaBookThumbUrl,
  komgaCollections,
  komgaCollectionSeries,
  komgaInProgress,
  komgaLatestBooks,
  komgaLibraries,
  komgaLibraryWebLink,
  komgaMarkRead,
  komgaMarkUnread,
  komgaOnDeck,
  komgaReadlistBooks,
  komgaReadlists,
  komgaSearchBooks,
  komgaSeries,
  komgaSeriesBooks,
  komgaSeriesThumbUrl,
  resolveKomgaWebUrl,
  type KomgaBook,
  type KomgaCollection,
  type KomgaLibrary,
  type KomgaReadlist,
  type KomgaSeries,
} from '../lib/komga';
import { ComicReader } from '../components/ComicReader';

type BooksView = 'home' | 'series' | 'collection' | 'readlist' | 'search';

export function MediaPage() {
  const { data, update, currentUser, isParent } = useApp();
  const settings = data.settings;
  const webUrl = resolveEmbyWebUrl(settings);
  const komgaWeb = resolveKomgaWebUrl(settings);
  const me = currentUser || data.members.find((m) => m.id === settings.currentUserId);
  const embyUserId = me?.embyUserId?.trim() || '';
  // Every Komga request is made with the current family member's key.
  // This is critical: Komga stores read progress separately for each user.
  const komgaMemberId = me?.id || undefined;

  const [serverId, setServerId] = useState(settings.emby?.serverId || '');
  const [resume, setResume] = useState<EmbyItem[]>([]);
  const [views, setViews] = useState<EmbyView[]>([]);
  const [embyLoading, setEmbyLoading] = useState(false);
  const [embyError, setEmbyError] = useState<string | null>(null);

  const [inProgress, setInProgress] = useState<KomgaBook[]>([]);
  const [onDeck, setOnDeck] = useState<KomgaBook[]>([]);
  const [latest, setLatest] = useState<KomgaBook[]>([]);
  const [libraries, setLibraries] = useState<KomgaLibrary[]>([]);
  const [collections, setCollections] = useState<KomgaCollection[]>([]);
  const [readlists, setReadlists] = useState<KomgaReadlist[]>([]);
  const [series, setSeries] = useState<KomgaSeries[]>([]);
  const [booksView, setBooksView] = useState<BooksView>('home');
  const [selectedSeries, setSelectedSeries] = useState<KomgaSeries | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<KomgaCollection | null>(null);
  const [selectedReadlist, setSelectedReadlist] = useState<KomgaReadlist | null>(null);
  const [browseBooks, setBrowseBooks] = useState<KomgaBook[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<KomgaBook[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [komgaLoading, setKomgaLoading] = useState(false);
  const [komgaError, setKomgaError] = useState<string | null>(null);
  const [readingBook, setReadingBook] = useState<KomgaBook | null>(null);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);

  const loadEmby = async () => {
    if (!embyUserId) {
      setResume([]);
      setViews([]);
      setEmbyError(null);
      return;
    }
    setEmbyLoading(true);
    setEmbyError(null);
    try {
      let sid = serverId || settings.emby?.serverId || '';
      if (!sid) {
        try {
          const info = await embyPublicInfo();
          sid = info.Id || '';
          if (sid) {
            setServerId(sid);
            if (isParent) {
              update((d) => ({
                ...d,
                settings: {
                  ...d.settings,
                  emby: { ...d.settings.emby, webUrl: resolveEmbyWebUrl(d.settings), serverId: sid },
                },
              }));
            }
          }
        } catch {
          /* optional */
        }
      }
      const [r, v] = await Promise.all([embyResume(embyUserId, 12), embyViews(embyUserId)]);
      setResume(r);
      setViews(v);
      if (sid) setServerId(sid);
    } catch (e) {
      setEmbyError(e instanceof Error ? e.message : 'Failed to load Emby data');
      setResume([]);
      setViews([]);
    } finally {
      setEmbyLoading(false);
    }
  };

  const loadKomga = async () => {
    setKomgaLoading(true);
    setKomgaError(null);
    try {
      const [prog, deck, recent, libs, cols, lists] = await Promise.all([
        komgaInProgress(12, komgaMemberId),
        komgaOnDeck(12, komgaMemberId),
        komgaLatestBooks(12, komgaMemberId),
        komgaLibraries(komgaMemberId),
        komgaCollections(100, komgaMemberId),
        komgaReadlists(100, komgaMemberId),
      ]);
      setInProgress(prog);
      setOnDeck(deck);
      setLatest(recent);
      setLibraries(libs);
      setCollections(cols);
      setReadlists(lists);
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Failed to load Komga data');
      setInProgress([]);
      setOnDeck([]);
      setLatest([]);
      setLibraries([]);
      setCollections([]);
      setReadlists([]);
    } finally {
      setKomgaLoading(false);
    }
  };

  useEffect(() => {
    void loadEmby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embyUserId]);

  useEffect(() => {
    setBooksView('home');
    setSelectedSeries(null);
    setSelectedCollection(null);
    setSelectedReadlist(null);
    void loadKomga();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [komgaMemberId]);

  const openItem = (item: EmbyItem) => {
    if (!webUrl || !serverId) {
      if (webUrl) window.open(webUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    openEmbyItem({ webUrl, serverId, itemId: item.Id, tryNative: true });
  };

  const openLibrary = (view: EmbyView) => {
    if (!webUrl) return;
    window.open(serverId ? embyWebLibraryLink(webUrl, serverId, view.Id) : webUrl, '_blank', 'noopener,noreferrer');
  };

  const openKomgaBook = (book: KomgaBook) => setReadingBook(book);

  const refreshAfterBookChange = async () => {
    await loadKomga();
    if (booksView === 'series' && selectedSeries) {
      setBrowseBooks(await komgaSeriesBooks(selectedSeries.id, 100, komgaMemberId));
    } else if (booksView === 'collection' && selectedCollection) {
      setBrowseBooks(await komgaCollectionSeries(selectedCollection.id, 100, komgaMemberId).then(async (items) => {
        const chunks = await Promise.all(items.map((s) => komgaSeriesBooks(s.id, 100, komgaMemberId)));
        return chunks.flat();
      }));
    } else if (booksView === 'readlist' && selectedReadlist) {
      setBrowseBooks(await komgaReadlistBooks(selectedReadlist.id, 100, komgaMemberId));
    }
  };

  const toggleRead = async (book: KomgaBook) => {
    setBusyBookId(book.id);
    try {
      if (book.readProgress?.completed) await komgaMarkUnread(book.id, komgaMemberId);
      else await komgaMarkRead(book.id, book.media?.pagesCount || 1, komgaMemberId);
      await refreshAfterBookChange();
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Could not update reading status');
    } finally {
      setBusyBookId(null);
    }
  };

  const openSeries = async (item: KomgaSeries) => {
    setBooksView('series');
    setSelectedSeries(item);
    setSelectedCollection(null);
    setSelectedReadlist(null);
    setBrowseBooks([]);
    setBrowseLoading(true);
    try {
      setBrowseBooks(await komgaSeriesBooks(item.id, 100, komgaMemberId));
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Failed to load series');
    } finally {
      setBrowseLoading(false);
    }
  };

  const openCollection = async (item: KomgaCollection) => {
    setBooksView('collection');
    setSelectedCollection(item);
    setSelectedSeries(null);
    setSelectedReadlist(null);
    setBrowseBooks([]);
    setBrowseLoading(true);
    try {
      const collectionSeries = await komgaCollectionSeries(item.id, 100, komgaMemberId);
      const chunks = await Promise.all(collectionSeries.map((s) => komgaSeriesBooks(s.id, 100, komgaMemberId)));
      setBrowseBooks(chunks.flat());
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Failed to load collection');
    } finally {
      setBrowseLoading(false);
    }
  };

  const openReadlist = async (item: KomgaReadlist) => {
    setBooksView('readlist');
    setSelectedReadlist(item);
    setSelectedSeries(null);
    setSelectedCollection(null);
    setBrowseBooks([]);
    setBrowseLoading(true);
    try {
      setBrowseBooks(await komgaReadlistBooks(item.id, 100, komgaMemberId));
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Failed to load readlist');
    } finally {
      setBrowseLoading(false);
    }
  };

  const openSeriesBrowser = async () => {
    setBooksView('series');
    setSelectedSeries(null);
    setSelectedCollection(null);
    setSelectedReadlist(null);
    setBrowseBooks([]);
    setBrowseLoading(true);
    try {
      setSeries(await komgaSeries(100, komgaMemberId));
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Failed to load series');
    } finally {
      setBrowseLoading(false);
    }
  };

  const doSearch = async () => {
    const q = searchTerm.trim();
    if (!q) return;
    setBooksView('search');
    setSearchLoading(true);
    try {
      setSearchResults(await komgaSearchBooks(q, 40, komgaMemberId));
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const renderBookGrid = (books: KomgaBook[], empty = 'Nothing here yet.') => {
    if (browseLoading) return <p className="text-sm text-muted py-8 text-center">Loading…</p>;
    if (!books.length) return <p className="text-sm text-muted py-8 text-center">{empty}</p>;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {books.map((b) => {
          const pct = bookProgressPercent(b);
          const busy = busyBookId === b.id;
          return (
            <div key={b.id} className="min-w-0 group">
              <button type="button" onClick={() => openKomgaBook(b)} className="w-full text-left">
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
                  <img src={komgaBookThumbUrl(b.id, komgaMemberId)} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
                  {pct > 0 && pct < 100 && (
                    <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40">
                      <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {b.readProgress?.completed && (
                    <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-emerald-500/90 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-medium text-fg line-clamp-2 leading-snug">{bookTitle(b)}</p>
              </button>
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[11px] text-muted">{pct > 0 && pct < 100 ? `${Math.round(pct)}%` : b.readProgress?.completed ? 'Read' : 'Unread'}</span>
                <button
                  type="button"
                  title={b.readProgress?.completed ? 'Mark unread' : 'Mark read'}
                  disabled={busy}
                  onClick={() => void toggleRead(b)}
                  className="p-1 rounded-lg text-muted hover:text-fg hover:bg-nav-hover disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : b.readProgress?.completed ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBookRow = (books: KomgaBook[], empty: string) => {
    if (komgaLoading && books.length === 0) return <p className="text-sm text-muted py-6 text-center">Loading…</p>;
    if (!books.length) return <p className="text-sm text-muted py-4 text-center">{empty}</p>;
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {books.map((b) => {
          const pct = bookProgressPercent(b);
          return (
            <button key={b.id} type="button" onClick={() => openKomgaBook(b)} className="snap-start shrink-0 w-28 sm:w-32 text-left group">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
                <img src={komgaBookThumbUrl(b.id, komgaMemberId)} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
                {pct > 0 && pct < 100 && <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40"><div className="h-full bg-amber-400" style={{ width: `${pct}%` }} /></div>}
              </div>
              <p className="mt-1.5 text-xs sm:text-sm font-medium text-fg line-clamp-2 leading-snug">{bookTitle(b)}</p>
              {pct > 0 && pct < 100 && <p className="text-[11px] text-muted">{Math.round(pct)}%</p>}
            </button>
          );
        })}
      </div>
    );
  };

  const renderSeriesCards = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
      {series.map((s) => (
        <button key={s.id} type="button" onClick={() => void openSeries(s)} className="text-left group min-w-0">
          <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
            <img src={komgaSeriesThumbUrl(s.id, komgaMemberId)} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
          </div>
          <p className="mt-1.5 text-sm font-medium text-fg line-clamp-2">{s.name || s.sortTitle || 'Untitled series'}</p>
          {typeof s.unreadCount === 'number' && <p className="text-[11px] text-muted">{s.unreadCount} unread</p>}
        </button>
      ))}
    </div>
  );

  const renderBooksBrowser = () => {
    if (booksView === 'home') {
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void openSeriesBrowser()}><Library className="w-4 h-4" /> Series</Button>
            <Button size="sm" variant="secondary" onClick={() => { setBooksView('collection'); setSelectedCollection(null); setSelectedReadlist(null); }}><List className="w-4 h-4" /> Collections</Button>
            <Button size="sm" variant="secondary" onClick={() => { setBooksView('readlist'); setSelectedReadlist(null); setSelectedCollection(null); }}><List className="w-4 h-4" /> Readlists</Button>
            <div className="flex gap-2 ml-auto w-full sm:w-auto">
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void doSearch(); }} placeholder="Search books…" className="sm:w-56" />
              <Button size="sm" variant="secondary" onClick={() => void doSearch()} disabled={!searchTerm.trim() || searchLoading}><Search className="w-4 h-4" /></Button>
            </div>
          </div>

          <div><h3 className="text-sm font-semibold text-fg mb-2">Continue Reading</h3>{renderBookRow(inProgress, 'Nothing in progress right now.')}</div>
          {onDeck.length > 0 && <div><h3 className="text-sm font-semibold text-fg mb-2">On Deck</h3>{renderBookRow(onDeck, '')}</div>}
          {latest.length > 0 && <div><h3 className="text-sm font-semibold text-fg mb-2">Recently Added</h3>{renderBookRow(latest, '')}</div>}

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
              <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Collections</h3><span className="text-xs text-muted">{collections.length}</span></div>
              {collections.length ? <div className="space-y-1">{collections.slice(0, 8).map((c) => <button key={c.id} type="button" onClick={() => void openCollection(c)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-nav-hover text-left"><span className="flex-1 text-sm">{c.name}</span><ChevronRight className="w-4 h-4 text-muted" /></button>)}</div> : <p className="text-sm text-muted">No collections available.</p>}
            </div>
            <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
              <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Readlists</h3><span className="text-xs text-muted">{readlists.length}</span></div>
              {readlists.length ? <div className="space-y-1">{readlists.slice(0, 8).map((r) => <button key={r.id} type="button" onClick={() => void openReadlist(r)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-nav-hover text-left"><span className="flex-1 text-sm">{r.name}</span><ChevronRight className="w-4 h-4 text-muted" /></button>)}</div> : <p className="text-sm text-muted">No readlists available.</p>}
            </div>
          </div>
        </div>
      );
    }

    const back = () => { setBooksView('home'); setSelectedSeries(null); setSelectedCollection(null); setSelectedReadlist(null); setBrowseBooks([]); };

    if (booksView === 'search') {
      return <div className="space-y-4"><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={back}><ArrowLeft className="w-4 h-4" /> Back</Button><h3 className="font-semibold">Search: {searchTerm}</h3></div>{searchLoading ? <p className="text-sm text-muted py-8 text-center">Searching…</p> : renderBookGrid(searchResults, 'No books found.')}</div>;
    }

    if (booksView === 'series' && !selectedSeries) {
      return <div className="space-y-4"><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={back}><ArrowLeft className="w-4 h-4" /> Back</Button><h3 className="font-semibold">Series</h3></div>{renderSeriesCards()}</div>;
    }

    if (booksView === 'collection' && !selectedCollection) {
      return <div className="space-y-3"><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={back}><ArrowLeft className="w-4 h-4" /> Back</Button><h3 className="font-semibold">Collections</h3></div>{collections.length ? <div className="grid sm:grid-cols-2 gap-2">{collections.map((c) => <button key={c.id} type="button" onClick={() => void openCollection(c)} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-3 text-left hover:bg-nav-hover"><div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center"><Library className="w-4 h-4 text-amber-400" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{c.name}</p><p className="text-xs text-muted">{c.seriesIds?.length || 0} series</p></div><ChevronRight className="w-4 h-4 text-muted" /></button>)}</div> : <p className="text-sm text-muted py-8 text-center">No collections available.</p>}</div>;
    }

    if (booksView === 'readlist' && !selectedReadlist) {
      return <div className="space-y-3"><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={back}><ArrowLeft className="w-4 h-4" /> Back</Button><h3 className="font-semibold">Readlists</h3></div>{readlists.length ? <div className="grid sm:grid-cols-2 gap-2">{readlists.map((r) => <button key={r.id} type="button" onClick={() => void openReadlist(r)} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-3 text-left hover:bg-nav-hover"><div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center"><List className="w-4 h-4 text-amber-400" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{r.name}</p>{r.summary && <p className="text-xs text-muted truncate">{r.summary}</p>}</div><ChevronRight className="w-4 h-4 text-muted" /></button>)}</div> : <p className="text-sm text-muted py-8 text-center">No readlists available.</p>}</div>;
    }

    const title = selectedSeries?.name || selectedCollection?.name || selectedReadlist?.name || 'Books';
    return <div className="space-y-4"><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={back}><ArrowLeft className="w-4 h-4" /> Back</Button><h3 className="font-semibold">{title}</h3>{selectedSeries && <span className="text-xs text-muted">{browseBooks.length} books</span>}</div>{renderBookGrid(browseBooks, 'No books found.')}</div>;
  };

  return (
    <>
      <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight">Media</h1></div>

        <Card className="space-y-4 !p-4 sm:!p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center shrink-0"><Film className="w-6 h-6 text-accent" /></div>
            <div className="min-w-0 flex-1"><h2 className="font-semibold">Emby</h2></div>
            {embyUserId && <Button size="sm" variant="secondary" onClick={() => void loadEmby()} disabled={embyLoading}><RefreshCw className={`w-4 h-4 ${embyLoading ? 'animate-spin' : ''}`} /></Button>}
            {webUrl && <a href={webUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">Open <ExternalLink className="w-3.5 h-3.5" /></Button></a>}
          </div>
          {!embyUserId ? (
            <div className="rounded-xl border border-border bg-surface-2/50 px-4 py-6 text-center space-y-2"><Link2Off className="w-8 h-8 text-muted mx-auto" /><p className="text-sm font-medium text-fg">Not linked yet</p><p className="text-xs text-muted max-w-sm mx-auto">{isParent ? 'Link each profile’s Emby User ID under Settings → Media Servers.' : 'Ask a parent to link your Emby account in Settings.'}</p></div>
          ) : embyError ? (
            <div className="rounded-xl border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">{embyError}</div>
          ) : (
            <>
              <div><h3 className="text-sm font-semibold text-fg mb-2">Continue Watching</h3>{embyLoading && resume.length === 0 ? <p className="text-sm text-muted py-6 text-center">Loading…</p> : resume.length === 0 ? <p className="text-sm text-muted py-4 text-center">Nothing in progress right now.</p> : <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">{resume.map((item) => { const pct = playedPercent(item); return <button key={item.Id} type="button" onClick={() => openItem(item)} className="snap-start shrink-0 w-36 sm:w-40 text-left group"><div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm"><img src={embyImageUrl(item.Id, 240)} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />{pct > 0 && <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>}</div><p className="mt-1.5 text-xs sm:text-sm font-medium text-fg line-clamp-2 leading-snug">{displayTitle(item)}</p></button>; })}</div>}</div>
              {views.length > 0 && <div><h3 className="text-sm font-semibold text-fg mb-2">Libraries</h3><div className="flex flex-wrap gap-2">{views.map((v) => <Button key={v.Id} size="sm" variant="secondary" onClick={() => openLibrary(v)} disabled={!webUrl}>{v.Name}<ExternalLink className="w-3.5 h-3.5" /></Button>)}</div></div>}
            </>
          )}
        </Card>

        <Card className="space-y-5 !p-4 sm:!p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"><BookOpen className="w-6 h-6 text-amber-400" /></div>
            <div className="min-w-0 flex-1"><h2 className="font-semibold">Books</h2><p className="text-xs text-muted">Komga · {me?.name || 'current member'}</p></div>
            <Button size="sm" variant="secondary" onClick={() => void loadKomga()} disabled={komgaLoading}><RefreshCw className={`w-4 h-4 ${komgaLoading ? 'animate-spin' : ''}`} /></Button>
            {komgaWeb && <a href={komgaWeb} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">Komga <ExternalLink className="w-3.5 h-3.5" /></Button></a>}
          </div>

          {komgaError ? <div className="rounded-xl border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">{komgaError}<p className="text-xs mt-1 opacity-80">Your per-member Komga key is selected by the GreenHQ profile, so each person's reading progress stays separate.</p></div> : renderBooksBrowser()}

          {libraries.length > 0 && booksView === 'home' && <div><h3 className="text-sm font-semibold text-fg mb-2">Libraries</h3><div className="flex flex-wrap gap-2">{libraries.map((lib) => <Button key={lib.id} size="sm" variant="secondary" disabled={!komgaWeb} onClick={() => window.open(komgaLibraryWebLink(komgaWeb, lib.id), '_blank', 'noopener,noreferrer')}>{lib.name}<ExternalLink className="w-3.5 h-3.5" /></Button>)}</div></div>}
          {!komgaWeb && isParent && !komgaError && <p className="text-xs text-muted">Set Komga web URL in Settings for external deep links.</p>}
        </Card>
      </div>

      {readingBook && <ComicReader book={readingBook} memberId={komgaMemberId} onClose={() => { setReadingBook(null); void loadKomga(); }} onOpenBook={(b) => setReadingBook(b)} />}
    </>
  );
}
