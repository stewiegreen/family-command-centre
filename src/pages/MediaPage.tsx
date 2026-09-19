/**
 * GreenHQ Media — Emby-backed library home.
 * Artwork roles: Thumb/landscape = Continue Watching; Primary/poster = Latest;
 * Backdrop + Logo = detail hero. API key stays on the proxy.
 * Does not touch Emby webhook / screen-time / Tuya.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Clapperboard,
  ExternalLink,
  Film,
  Folder,
  Library,
  Loader2,
  Music,
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
import { VideoPlayer } from '../components/VideoPlayer';
import {
  displayTitle,
  embyBackdropUrl,
  embyBestLogoUrl,
  embyChildren,
  embyItem,
  embyItems,
  embyLatest,
  embyNextUp,
  embyPosterUrl,
  embyPublicInfo,
  embyResume,
  embySearch,
  embySortByForParent,
  embyViews,
  libraryKindLabel,
  sortMediaItems,
  openEmbyItem,
  playedPercent,
  resolveEmbyWebUrl,
  runtimeLabel,
  shortTitle,
  type EmbyItem,
  type EmbyView,
} from '../lib/emby';
import { MediaCard } from '../components/MediaCard';
import { cn } from '../lib/cn';

type Tab = 'home' | 'libraries' | 'search';

type Browse =
  | { kind: 'root' }
  | { kind: 'library'; view: EmbyView }
  | { kind: 'folder'; item: EmbyItem; title: string };

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
      <div className="flex items-end justify-between gap-2 px-0.5">
        <h2 className="text-lg font-bold text-fg tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function libraryIcon(view: EmbyView) {
  const t = (view.CollectionType || '').toLowerCase();
  if (t === 'movies') return Clapperboard;
  if (t === 'tvshows') return Tv;
  if (t === 'music' || t === 'musicvideos') return Music;
  if (t === 'homevideos') return Film;
  if (t === 'boxsets') return Library;
  return Folder;
}

function LibraryEntryCard({ view, onOpen }: { view: EmbyView; onOpen: () => void }) {
  const Icon = libraryIcon(view);
  const kind = libraryKindLabel(view);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="shrink-0 w-[9.5rem] sm:w-[11rem] border border-border bg-elevated p-4 text-left hover:border-accent/40 transition-colors group [border-radius:var(--app-card-radius,1rem)]"
      style={{ boxShadow: 'var(--app-shadow-card)' }}
    >
      <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-sm font-bold text-fg line-clamp-2">{view.Name}</p>
      <p className="text-[11px] text-muted mt-1">{kind}</p>
    </button>
  );
}

export function MediaPage() {
  const { data, currentUser, setView } = useApp();
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
  /** Latest items keyed by library view id */
  const [latestByView, setLatestByView] = useState<Record<string, EmbyItem[]>>({});

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
  const [watching, setWatching] = useState<EmbyItem | null>(null);

  const canPlay = Boolean(webUrl && serverId);
  const logoUrl = focus ? embyBestLogoUrl(focus, 120) : null;

  const play = useCallback(
    (item: EmbyItem) => {
      if (embyUserId && (item.Type === 'Movie' || item.Type === 'Episode' || !item.Type)) {
        setFocus(null);
        setWatching(item);
        return;
      }
      if (!webUrl || !serverId) return;
      openEmbyItem({ webUrl, serverId, itemId: item.Id });
    },
    [webUrl, serverId, embyUserId],
  );

  const playExternal = useCallback(
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
        setViews([]);
        setLatestByView({});
        return;
      }
      setServerId(info.Id || '');
      setServerName(info.ServerName || '');

      const [v, r, n] = await Promise.all([
        embyViews(embyUserId).catch(() => [] as EmbyView[]),
        embyResume(embyUserId, 16).catch(() => [] as EmbyItem[]),
        embyNextUp(embyUserId, 16).catch(() => [] as EmbyItem[]),
      ]);
      setViews(v);
      setResume(r);
      setNextUp(n);

      // Latest per discovered library (parallel, capped)
      const latestEntries = await Promise.all(
        v.slice(0, 12).map(async (view) => {
          const items = await embyLatest(embyUserId, 14, view.Id).catch(() => [] as EmbyItem[]);
          return [view.Id, items] as const;
        }),
      );
      const map: Record<string, EmbyItem[]> = {};
      for (const [id, items] of latestEntries) map[id] = items;
      setLatestByView(map);
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
    if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Folder' || item.Type === 'BoxSet') {
      pushBrowse({ kind: 'folder', item, title: item.Name || 'Folder' });
      setTab('libraries');
      setDetailLoading(true);
      setDetailItems([]);
      setDetailStart(0);
      try {
        const { items, total } = await embyChildren(embyUserId, item.Id, {
          limit: 48,
          parentType: item.Type,
        });
        setDetailItems(sortMediaItems(items));
        setDetailTotal(total);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
      return;
    }
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
      const sortBy = embySortByForParent({ collectionType: view.CollectionType });
      const { items, total } = await embyItems(embyUserId, {
        parentId: view.Id,
        recursive: false,
        sortBy,
        sortOrder: 'Ascending',
        limit: 48,
        startIndex: 0,
      });
      setDetailItems(sortMediaItems(items));
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
      const sortBy =
        browse.kind === 'library'
          ? embySortByForParent({ collectionType: browse.view.CollectionType })
          : browse.kind === 'folder'
            ? embySortByForParent({ parentType: browse.item.Type })
            : 'IndexNumber,SortName';
      const { items, total } = await embyItems(embyUserId, {
        parentId,
        recursive: false,
        sortBy,
        sortOrder: 'Ascending',
        limit: 48,
        startIndex: next,
      });
      setDetailItems((prev) => sortMediaItems([...prev, ...items]));
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

  // Merge resume + next-up for Continue (dedupe by Id, resume first)
  const continueItems = useMemo(() => {
    const seen = new Set<string>();
    const out: EmbyItem[] = [];
    for (const item of [...resume, ...nextUp]) {
      if (seen.has(item.Id)) continue;
      seen.add(item.Id);
      out.push(item);
    }
    return out;
  }, [resume, nextUp]);

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
            {currentUser?.name}&apos;s library
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

      {/* ── HOME ── */}
      {tab === 'home' && (
        <div className="space-y-9">
          {loading && !continueItems.length && !views.length ? (
            <div className="flex justify-center py-16 text-muted">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <>
              <Section title="Continue Watching" empty={!continueItems.length}>
                <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                  {continueItems.map((item) => (
                    <div key={item.Id} className="snap-start">
                      <MediaCard
                        item={item}
                        variant="continue"
                        onOpen={() => void openFocus(item)}
                      />
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Your Media" empty={!views.length}>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                  {views.map((v) => (
                    <LibraryEntryCard key={v.Id} view={v} onOpen={() => void openLibrary(v)} />
                  ))}
                </div>
              </Section>

              {views.map((view) => {
                const items = latestByView[view.Id] || [];
                if (!items.length) return null;
                return (
                  <Section key={view.Id} title={`Latest ${view.Name}`} empty={false}>
                    <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
                      {items.map((item) => (
                        <MediaCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
                      ))}
                    </div>
                  </Section>
                );
              })}

              {!loading &&
                !error &&
                !continueItems.length &&
                !views.length && (
                  <Card className="p-10 text-center space-y-2">
                    <Film className="w-10 h-10 text-muted mx-auto opacity-50" />
                    <p className="text-sm font-semibold text-fg">Nothing to show yet</p>
                    <p className="text-sm text-muted max-w-md mx-auto">
                      Emby is reachable but this account has no libraries. Check library access for this
                      Emby user.
                    </p>
                  </Card>
                )}
            </>
          )}
        </div>
      )}

      {/* ── LIBRARIES / BROWSE ── */}
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
            <div className="flex flex-wrap gap-3">
              {views.map((v) => (
                <LibraryEntryCard key={v.Id} view={v} onOpen={() => void openLibrary(v)} />
              ))}
              {!views.length && !loading && (
                <p className="text-sm text-muted w-full py-8 text-center">No libraries found.</p>
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
                {detailTotal > 0 && <p className="text-xs text-muted mt-0.5">{detailTotal} items</p>}
              </div>
              {detailLoading && !detailItems.length ? (
                <div className="flex justify-center py-12 text-muted">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-4">
                    {detailItems.map((item) => (
                      <MediaCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
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

      {/* ── SEARCH ── */}
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
              <MediaCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
            ))}
          </div>
        </div>
      )}

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-fg">Comics</h2>
          <p className="text-xs text-muted mt-0.5">Komga library in GreenHQ.</p>
        </div>
        <Button size="sm" onClick={() => setView('comics')}>
          Open Comics
        </Button>
      </Card>

      {watching && embyUserId && (
        <VideoPlayer
          item={watching}
          userId={embyUserId}
          webUrl={webUrl}
          serverId={serverId}
          onClose={() => {
            setWatching(null);
            void loadHome();
          }}
        />
      )}

      {/* Cinematic detail — backdrop + logo title */}
      <Modal
        open={!!focus}
        onClose={() => setFocus(null)}
        title={focus ? shortTitle(focus) : 'Title'}
        size="lg"
      >
        {focus && (
          <div className="space-y-4 -mt-1">
            {/* Hero — backdrop + poster, GreenHQ elevated chrome */}
            <div className="relative -mx-4 -mt-2 overflow-hidden min-h-[12rem] sm:min-h-[15rem] border-b border-border">
              <img
                src={embyBackdropUrl(focus, 1280)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0.25';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--app-elevated,var(--app-surface,#111))] via-black/50 to-black/20" />
              <div className="relative z-10 flex gap-4 items-end min-h-[12rem] sm:min-h-[15rem] p-4 sm:p-5">
                <div
                  className="hidden xs:block sm:block w-[5.5rem] sm:w-28 shrink-0 overflow-hidden border border-border bg-surface-2 shadow-lg"
                  style={{ borderRadius: 'var(--app-card-radius, 1rem)' }}
                >
                  <img
                    src={embyPosterUrl(focus, 280)}
                    alt=""
                    className="w-full aspect-[2/3] object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5 pb-0.5">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={displayTitle(focus)}
                      className="max-h-14 sm:max-h-[4.5rem] w-auto max-w-full object-contain object-left drop-shadow-md"
                    />
                  ) : (
                    <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight drop-shadow-md">
                      {displayTitle(focus)}
                    </h3>
                  )}
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-white/80">
                    {focus.ProductionYear ? <span>{focus.ProductionYear}</span> : null}
                    {focus.OfficialRating ? <span>· {focus.OfficialRating}</span> : null}
                    {runtimeLabel(focus) ? <span>· {runtimeLabel(focus)}</span> : null}
                    {focus.Genres?.slice(0, 2).map((g) => (
                      <span key={g}>· {g}</span>
                    ))}
                    {playedPercent(focus) > 0 && playedPercent(focus) < 100 ? (
                      <span className="text-amber-300 font-semibold">
                        · {Math.round(playedPercent(focus))}% watched
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <Button size="sm" disabled={!embyUserId} onClick={() => play(focus)}>
                      <Play className="w-4 h-4" />
                      {playedPercent(focus) > 0 && playedPercent(focus) < 100 ? 'Resume' : 'Play'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canPlay}
                      onClick={() => playExternal(focus)}
                    >
                      <ExternalLink className="w-4 h-4" />
                      Emby
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {focusLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted" />
            ) : focus.Overview ? (
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Overview</p>
                <p className="text-sm text-fg-secondary leading-relaxed">{focus.Overview}</p>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
