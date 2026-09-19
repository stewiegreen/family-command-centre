/**
 * Emby Phase A — GreenHQ media library (browse + deep-link play).
 * Emby remains source of truth; API key stays on the proxy.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Tv,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import {
  displayTitle,
  embyChildren,
  embyImageUrl,
  embyItem,
  embyItems,
  embyLatest,
  embyNextUp,
  embyPublicInfo,
  embyResume,
  embySearch,
  embyViews,
  openEmbyItem,
  playedPercent,
  resolveEmbyWebUrl,
  runtimeLabel,
  shortTitle,
  type EmbyItem,
  type EmbyView,
} from '../lib/emby';
import { cn } from '../lib/cn';

type Tab = 'home' | 'libraries' | 'search';

type Browse =
  | { kind: 'root' }
  | { kind: 'library'; view: EmbyView }
  | { kind: 'folder'; item: EmbyItem; title: string };

const COVER =
  'w-[42%] min-w-[9rem] max-w-[11rem] sm:w-[28%] sm:max-w-[12rem] md:w-[17%] md:min-w-[10rem] md:max-w-[13rem]';

function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  if (pct <= 0 || pct >= 100) return null;
  return (
    <div className={cn('h-1.5 rounded-full bg-black/40 overflow-hidden', className)}>
      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Poster({
  item,
  className,
  maxWidth = 320,
}: {
  item: EmbyItem;
  className?: string;
  maxWidth?: number;
}) {
  return (
    <div
      className={cn(
        'relative aspect-[2/3] rounded-2xl overflow-hidden bg-surface-2 border border-border shadow-md',
        className,
      )}
    >
      <img
        src={embyImageUrl(item.Id, maxWidth)}
        alt=""
        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/35">
        <span className="rounded-full bg-accent text-accent-ink p-2.5 shadow-lg">
          <Play className="w-5 h-5 fill-current" />
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent">
        <ProgressBar pct={playedPercent(item)} />
      </div>
      {item.UserData?.Played && (
        <span className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5">
          Watched
        </span>
      )}
    </div>
  );
}

function ItemCard({
  item,
  onOpen,
  hero,
}: {
  item: EmbyItem;
  onOpen: () => void;
  hero?: boolean;
}) {
  const pct = playedPercent(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('shrink-0 text-left group', COVER)}
      aria-label={displayTitle(item)}
    >
      <Poster item={item} maxWidth={hero ? 400 : 320} />
      <p className="mt-2 text-sm font-semibold text-fg line-clamp-2 leading-snug">{shortTitle(item)}</p>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
        {item.ProductionYear ? <span>{item.ProductionYear}</span> : null}
        {item.Type === 'Episode' && pct > 0 && pct < 100 ? (
          <span className="font-semibold text-accent">{Math.round(pct)}%</span>
        ) : null}
        {item.Type === 'Series' && item.UserData?.UnplayedItemCount ? (
          <span>{item.UserData.UnplayedItemCount} unwatched</span>
        ) : null}
        {item.Type && !['Movie', 'Episode', 'Series'].includes(item.Type) ? (
          <span className="capitalize">{item.Type}</span>
        ) : null}
      </div>
    </button>
  );
}

function Section({
  title,
  children,
  empty,
  action,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
  action?: ReactNode;
}) {
  if (empty) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-lg font-bold text-fg tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MediaPage() {
  const { data, currentUser, setView } = useApp();
  const memberId = currentUser?.id;
  const embyUserId = currentUser?.embyUserId?.trim() || '';
  const webUrl = resolveEmbyWebUrl(data.settings);

  const [tab, setTab] = useState<Tab>('home');
  const [browseStack, setBrowseStack] = useState<Browse[]>([{ kind: 'root' }]);
  const browse = browseStack[browseStack.length - 1] || { kind: 'root' as const };
  const pushBrowse = (b: Browse) => setBrowseStack((s) => [...s, b]);
  const goBack = () => setBrowseStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const goRoot = () => setBrowseStack([{ kind: 'root' }]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverId, setServerId] = useState('');
  const [serverName, setServerName] = useState('');
  const [views, setViews] = useState<EmbyView[]>([]);
  const [resume, setResume] = useState<EmbyItem[]>([]);
  const [nextUp, setNextUp] = useState<EmbyItem[]>([]);
  const [latest, setLatest] = useState<EmbyItem[]>([]);

  const [detailItems, setDetailItems] = useState<EmbyItem[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStart, setDetailStart] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<EmbyItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [focus, setFocus] = useState<EmbyItem | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);

  const canPlay = Boolean(webUrl && serverId);

  const play = useCallback(
    (item: EmbyItem) => {
      if (!webUrl || !serverId) return;
      openEmbyItem({ webUrl, serverId, itemId: item.Id });
    },
    [webUrl, serverId],
  );

  const loadHome = useCallback(async () => {
    if (!embyUserId) {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let info: { Id?: string; ServerName?: string };
      try {
        info = await embyPublicInfo();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /503|not configured/i.test(msg)
            ? 'Media service is not available. Check Emby proxy settings and try Refresh.'
            : `Could not reach Emby. (${msg})`,
        );
        setResume([]);
        setNextUp([]);
        setLatest([]);
        setViews([]);
        return;
      }
      setServerId(info.Id || '');
      setServerName(info.ServerName || '');

      const [v, r, n, l] = await Promise.all([
        embyViews(embyUserId).catch(() => [] as EmbyView[]),
        embyResume(embyUserId, 16).catch(() => [] as EmbyItem[]),
        embyNextUp(embyUserId, 16).catch(() => [] as EmbyItem[]),
        embyLatest(embyUserId, 16).catch(() => [] as EmbyItem[]),
      ]);
      setViews(v);
      setResume(r);
      setNextUp(n);
      setLatest(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [embyUserId]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  const openFocus = async (item: EmbyItem) => {
    // Folders / collections / series → browse children in-page
    if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Folder' || item.Type === 'BoxSet') {
      pushBrowse({ kind: 'folder', item, title: item.Name || 'Folder' });
      setTab('libraries');
      setDetailLoading(true);
      setDetailItems([]);
      setDetailStart(0);
      try {
        const { items, total } = await embyChildren(embyUserId, item.Id, { limit: 48 });
        setDetailItems(items);
        setDetailTotal(total);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
      return;
    }
    // Movie / Episode → detail sheet then Play
    setFocusLoading(true);
    setFocus(item);
    try {
      const full = await embyItem(embyUserId, item.Id);
      setFocus(full);
    } catch {
      /* keep list item */
    } finally {
      setFocusLoading(false);
    }
  };

  const openLibrary = async (view: EmbyView) => {
    pushBrowse({ kind: 'library', view });
    setTab('libraries');
    setDetailLoading(true);
    setDetailItems([]);
    setDetailStart(0);
    try {
      const { items, total } = await embyItems(embyUserId, {
        parentId: view.Id,
        recursive: false,
        sortBy: 'SortName',
        limit: 48,
        startIndex: 0,
      });
      setDetailItems(items);
      setDetailTotal(total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const loadMoreDetail = useCallback(async () => {
    if (!embyUserId || detailLoading) return;
    if (detailItems.length >= detailTotal && detailTotal > 0) return;
    const parentId =
      browse.kind === 'library' ? browse.view.Id : browse.kind === 'folder' ? browse.item.Id : null;
    if (!parentId) return;
    setDetailLoading(true);
    const next = detailStart + 48;
    try {
      const { items, total } = await embyItems(embyUserId, {
        parentId,
        recursive: false,
        sortBy: 'SortName',
        limit: 48,
        startIndex: next,
      });
      setDetailItems((prev) => [...prev, ...items]);
      setDetailTotal(total);
      setDetailStart(next);
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  }, [embyUserId, detailLoading, detailItems.length, detailTotal, detailStart, browse]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || browse.kind === 'root') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreDetail();
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [browse.kind, loadMoreDetail, detailItems.length]);

  // Search debounce
  useEffect(() => {
    if (tab !== 'search') return;
    const q = search.trim();
    if (!q || !embyUserId) {
      setSearchResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearchLoading(true);
      void embySearch(embyUserId, q, 40)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [search, tab, embyUserId]);

  const tabs: { id: Tab; label: string }[] = useMemo(
    () => [
      { id: 'home', label: 'Home' },
      { id: 'libraries', label: 'Libraries' },
      { id: 'search', label: 'Search' },
    ],
    [],
  );

  if (!embyUserId) {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
          <Film className="w-6 h-6 text-accent" />
          Media
        </h1>
        <Card className="p-8 text-center space-y-2">
          <Tv className="w-10 h-10 text-muted mx-auto opacity-50" />
          <p className="text-sm font-semibold text-fg">Emby account not linked</p>
          <p className="text-sm text-muted max-w-md mx-auto">
            A parent needs to set this profile&apos;s Emby user id in Settings before Continue Watching and
            the library can load.
          </p>
        </Card>
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-fg">Comics</h2>
            <p className="text-xs text-muted mt-0.5">Browse your Komga library.</p>
          </div>
          <Button size="sm" onClick={() => setView('comics')}>
            Open Comics
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Film className="w-6 h-6 text-accent" />
            Media
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {serverName ? `${serverName} · ` : ''}
            {currentUser?.name}&apos;s Emby library
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void loadHome()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
          {webUrl && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open(webUrl, '_blank', 'noopener,noreferrer')}
            >
              Open Emby
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-warn bg-warn/10 rounded-xl px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-2 border border-border w-full sm:w-auto overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              if (t.id === 'home') goRoot();
            }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
              tab === t.id ? 'bg-elevated text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* HOME */}
      {tab === 'home' && (
        <div className="space-y-8">
          {loading && !resume.length && !latest.length ? (
            <div className="flex justify-center py-16 text-muted">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <>
              <Section title="Continue Watching" empty={!resume.length}>
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                  {resume.map((item) => (
                    <ItemCard key={item.Id} item={item} hero onOpen={() => void openFocus(item)} />
                  ))}
                </div>
              </Section>

              <Section title="Next Up" empty={!nextUp.length}>
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                  {nextUp.map((item) => (
                    <ItemCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
                  ))}
                </div>
              </Section>

              <Section title="Recently Added" empty={!latest.length}>
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                  {latest.map((item) => (
                    <ItemCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
                  ))}
                </div>
              </Section>

              <Section title="Libraries" empty={!views.length}>
                <div className="flex flex-wrap gap-2">
                  {views.map((v) => (
                    <Button key={v.Id} size="sm" variant="secondary" onClick={() => void openLibrary(v)}>
                      {v.Name}
                    </Button>
                  ))}
                </div>
              </Section>

              {!loading && !error && !resume.length && !nextUp.length && !latest.length && !views.length && (
                <Card className="p-10 text-center space-y-2">
                  <Film className="w-10 h-10 text-muted mx-auto opacity-50" />
                  <p className="text-sm font-semibold text-fg">Nothing to show yet</p>
                  <p className="text-sm text-muted max-w-md mx-auto">
                    Emby is reachable but this account has no libraries or resume items. Check library
                    access for this Emby user.
                  </p>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* LIBRARIES / BROWSE */}
      {tab === 'libraries' && (
        <div className="space-y-4">
          {browse.kind !== 'root' && (
            <button
              type="button"
              onClick={() => (browseStack.length > 1 ? goBack() : goRoot())}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {browse.kind === 'root' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {views.map((v) => (
                <button
                  key={v.Id}
                  type="button"
                  onClick={() => void openLibrary(v)}
                  className="text-left rounded-2xl border border-border bg-elevated p-4 hover:border-accent/40 transition-colors"
                >
                  <p className="font-semibold text-fg">{v.Name}</p>
                  {v.CollectionType ? (
                    <p className="text-xs text-muted mt-1 capitalize">{v.CollectionType}</p>
                  ) : null}
                </button>
              ))}
              {!views.length && !loading && (
                <p className="text-sm text-muted col-span-full py-8 text-center">No libraries found.</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  {browse.kind === 'library' ? 'Library' : browse.item.Type || 'Folder'}
                </p>
                <h2 className="text-xl font-bold text-fg">
                  {browse.kind === 'library' ? browse.view.Name : browse.title}
                </h2>
                {detailTotal > 0 && (
                  <p className="text-xs text-muted mt-0.5">{detailTotal} items</p>
                )}
              </div>
              {detailLoading && !detailItems.length ? (
                <div className="flex justify-center py-12 text-muted">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-4">
                    {detailItems.map((item) => (
                      <ItemCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
                    ))}
                  </div>
                  {!detailItems.length && (
                    <p className="text-sm text-muted text-center py-8">This folder is empty.</p>
                  )}
                  <div ref={loadMoreRef} className="h-8 flex items-center justify-center">
                    {detailLoading && detailItems.length > 0 && (
                      <Loader2 className="w-5 h-5 animate-spin text-muted" />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* SEARCH */}
      {tab === 'search' && (
        <div className="space-y-4">
          <label className="relative block max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search movies, shows, episodes…"
              className="pl-9 h-11"
              aria-label="Search media"
              autoFocus
            />
          </label>
          {searchLoading && (
            <div className="flex justify-center py-8 text-muted">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {!searchLoading && search.trim() && !searchResults.length && (
            <p className="text-sm text-muted text-center py-8">No titles match “{search.trim()}”.</p>
          )}
          <div className="flex flex-wrap gap-4">
            {searchResults.map((item) => (
              <ItemCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
            ))}
          </div>
        </div>
      )}

      {/* Comics handoff */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-fg">Comics</h2>
          <p className="text-xs text-muted mt-0.5">Komga library in GreenHQ.</p>
        </div>
        <Button size="sm" onClick={() => setView('comics')}>
          Open Comics
        </Button>
      </Card>

      {/* Detail / Play modal */}
      <Modal open={!!focus} onClose={() => setFocus(null)} title={focus ? shortTitle(focus) : 'Title'}>
        {focus && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-28 sm:w-32 shrink-0">
                <Poster item={focus} maxWidth={280} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="text-lg font-bold text-fg leading-snug">{displayTitle(focus)}</h3>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  {focus.ProductionYear ? <span>{focus.ProductionYear}</span> : null}
                  {focus.OfficialRating ? <span>{focus.OfficialRating}</span> : null}
                  {runtimeLabel(focus) ? <span>{runtimeLabel(focus)}</span> : null}
                  {focus.Type ? <span className="capitalize">{focus.Type}</span> : null}
                  {playedPercent(focus) > 0 && playedPercent(focus) < 100 ? (
                    <span className="text-accent font-semibold">{Math.round(playedPercent(focus))}% watched</span>
                  ) : null}
                </div>
                {focusLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted" />
                ) : focus.Overview ? (
                  <p className="text-sm text-fg-secondary leading-relaxed line-clamp-6">{focus.Overview}</p>
                ) : (
                  <p className="text-sm text-muted">No overview.</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1 min-w-[8rem]"
                disabled={!canPlay}
                onClick={() => play(focus)}
              >
                <Play className="w-4 h-4" />
                {playedPercent(focus) > 0 && playedPercent(focus) < 100 ? 'Resume in Emby' : 'Play in Emby'}
              </Button>
              <Button variant="secondary" onClick={() => setFocus(null)}>
                Close
              </Button>
            </div>
            {!canPlay && (
              <p className="text-xs text-muted">
                Set the Emby web URL in Settings (and ensure the server is reachable) to open titles.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
