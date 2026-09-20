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
  Share2,
  Tv,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { MediaRecommendation } from '../types';
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
  showEmbyLatestRow,
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
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-fg tracking-tight">{title}</h2>
          {subtitle ? <p className="text-xs text-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Film;
  title: string;
  body: string;
}) {
  return (
    <Card className="p-10 sm:p-12 text-center space-y-2 border-dashed">
      <Icon className="w-10 h-10 text-muted mx-auto opacity-40" />
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">{body}</p>
    </Card>
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
      className="shrink-0 w-[9.5rem] sm:w-[11rem] rounded-2xl border border-border bg-elevated p-4 text-left hover:border-accent/50 hover:shadow-md transition-all group"
      style={{ boxShadow: 'var(--app-shadow-card)' }}
    >
      <div className="w-11 h-11 rounded-2xl bg-accent/12 text-accent flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm font-bold text-fg line-clamp-2 leading-snug">{view.Name}</p>
      <p className="text-[11px] text-muted mt-1">{kind}</p>
    </button>
  );
}

export function MediaPage() {
  const { data, currentUser, setView, update } = useApp();
  const members = data.members || [];
  const memberId = currentUser?.id || '';
  const embyUserId = currentUser?.embyUserId?.trim() || '';
  const webUrl = resolveEmbyWebUrl(data.settings);

  const [tab, setTab] = useState<Tab>('home');
  /** Where the user started this browse path — Back at root returns here (not always Libraries). */
  const [browseOrigin, setBrowseOrigin] = useState<Tab>('home');
  const [browseStack, setBrowseStack] = useState<Browse[]>([{ kind: 'root' }]);
  const browse = browseStack[browseStack.length - 1] || { kind: 'root' as const };
  const pushBrowse = (b: Browse) => setBrowseStack((s) => [...s, b]);
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

  const [recommendTarget, setRecommendTarget] = useState<EmbyItem | null>(null);
  const [recommendToId, setRecommendToId] = useState('');
  const [recommendMsg, setRecommendMsg] = useState('');
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [recommendFlash, setRecommendFlash] = useState<string | null>(null);
  const [recUnavailable, setRecUnavailable] = useState<string | null>(null);

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

      // Latest only for movies/TV-style libraries (skip Music, Live TV, Photos, …)
      const latestViews = v.filter(showEmbyLatestRow).slice(0, 8);
      const latestEntries = await Promise.all(
        latestViews.map(async (view) => {
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

  /** Load the grid for a stack frame (series → seasons, season → episodes, library → titles). */
  const loadBrowseLevel = useCallback(
    async (level: Browse) => {
      if (!embyUserId) return;
      if (level.kind === 'root') {
        setDetailItems([]);
        setDetailTotal(0);
        setDetailStart(0);
        return;
      }
      setDetailLoading(true);
      setDetailItems([]);
      setDetailStart(0);
      try {
        if (level.kind === 'library') {
          const sortBy = embySortByForParent({ collectionType: level.view.CollectionType });
          const { items, total } = await embyItems(embyUserId, {
            parentId: level.view.Id,
            recursive: false,
            sortBy,
            sortOrder: 'Ascending',
            limit: 48,
            startIndex: 0,
          });
          setDetailItems(sortMediaItems(items));
          setDetailTotal(total);
        } else {
          const { items, total } = await embyChildren(embyUserId, level.item.Id, {
            limit: 48,
            parentType: level.item.Type,
          });
          setDetailItems(sortMediaItems(items));
          setDetailTotal(total);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [embyUserId],
  );


  // Whenever the top of the stack changes, show that level’s content
  useEffect(() => {
    if (tab !== 'libraries') return;
    void loadBrowseLevel(browse);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-load when stack identity changes
  }, [
    tab,
    browse.kind,
    browse.kind === 'library' ? browse.view.Id : '',
    browse.kind === 'folder' ? browse.item.Id : '',
    loadBrowseLevel,
  ]);


  const handleBackToOrigin = useCallback(() => {
    setBrowseStack((s) => {
      // At root already → leave browse, return to Home (or prior tab)
      if (s.length <= 1) {
        queueMicrotask(() => setTab(browseOrigin));
        return [{ kind: 'root' }];
      }
      // One level deep (e.g. Home → Series, or Home → Movies library):
      // skip the empty Libraries root and return to where the user started.
      if (s.length === 2 && browseOrigin !== 'libraries') {
        queueMicrotask(() => setTab(browseOrigin));
        return [{ kind: 'root' }];
      }
      // Deeper (e.g. Library → Series → Season): pop to parent so seasons reappear
      return s.slice(0, -1);
    });
  }, [browseOrigin]);

  const openFocus = async (item: EmbyItem) => {
    if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Folder' || item.Type === 'BoxSet' || item.Type === 'MusicArtist' || item.Type === 'MusicAlbum') {
      // Remember Home vs Libraries so Back can leave browse correctly
      setBrowseOrigin(tab === 'search' ? 'home' : tab);
      setTab('libraries');
      pushBrowse({ kind: 'folder', item, title: item.Name || 'Folder' });
      // loadBrowseLevel runs via useEffect when stack updates
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
    setBrowseOrigin(tab === 'libraries' ? 'libraries' : tab);
    setTab('libraries');
    pushBrowse({ kind: 'library', view });
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
  const myMediaRecommendations = useMemo(() => {
    return (data.mediaRecommendations || []).filter(
      (r) => r.toMemberId === memberId && r.status !== 'dismissed',
    );
  }, [data.mediaRecommendations, memberId]);

  const otherMembers = useMemo(
    () => members.filter((m) => m.id && m.id !== memberId),
    [members, memberId],
  );

  const sendMediaRecommendation = () => {
    if (!recommendTarget || !memberId || !recommendToId) return;
    const to = members.find((m) => m.id === recommendToId);
    if (!to) return;
    setRecommendBusy(true);
    const msg = recommendMsg.trim().slice(0, 280);
    const rec: MediaRecommendation = {
      id: `mr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      fromMemberId: memberId,
      toMemberId: recommendToId,
      embyItemId: recommendTarget.Id,
      mediaType: recommendTarget.Type,
      title: displayTitle(recommendTarget),
      message: msg || undefined,
      createdAt: new Date().toISOString(),
      status: 'unread',
    };
    update((d) => ({
      ...d,
      mediaRecommendations: [rec, ...(d.mediaRecommendations || [])].slice(0, 100),
    }));
    setRecommendBusy(false);
    setRecommendTarget(null);
    setRecommendToId('');
    setRecommendMsg('');
    setRecommendFlash(`Recommended to ${to.name}`);
    window.setTimeout(() => setRecommendFlash(null), 2800);
  };

  const dismissMediaRecommendation = (id: string) => {
    update((d) => ({
      ...d,
      mediaRecommendations: (d.mediaRecommendations || []).map((r) =>
        r.id === id ? { ...r, status: 'dismissed' as const } : r,
      ),
    }));
  };

  const openMediaRecommendation = async (rec: MediaRecommendation) => {
    setRecUnavailable(null);
    update((d) => ({
      ...d,
      mediaRecommendations: (d.mediaRecommendations || []).map((r) =>
        r.id === rec.id && r.status === 'unread' ? { ...r, status: 'opened' as const } : r,
      ),
    }));
    if (!embyUserId) {
      setRecUnavailable('Link an Emby account on this profile to open recommendations.');
      return;
    }
    try {
      const item = await embyItem(embyUserId, rec.embyItemId);
      void openFocus(item);
    } catch {
      setRecUnavailable(
        `"${rec.title}" isn't available on your Emby account. Emby permissions still apply.`,
      );
    }
  };

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
        <EmptyState
          icon={Tv}
          title="Media not linked yet"
          body="A parent needs to link this profile’s media account in Settings before Continue Watching and libraries can load."
        />
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
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2 tracking-tight">
            <Film className="w-7 h-7 text-accent" />
            Media
          </h1>
          <p className="text-sm text-muted mt-1">
            {currentUser?.name ? `${currentUser.name}'s collection` : 'Your collection'}
            {serverName ? ` · ${serverName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void loadHome()} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-warn bg-warn/10 rounded-xl px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-1 p-1 rounded-2xl bg-surface-2 border border-border w-full sm:w-fit overflow-x-auto">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => {
              setTab(tabItem.id);
              if (tabItem.id === 'home') goRoot();
            }}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap',
              tab === tabItem.id
                ? 'bg-elevated text-fg shadow-sm'
                : 'text-muted hover:text-fg',
            )}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* ── HOME ── */}
      {tab === 'home' && (
        <div className="space-y-9">
          {loading && !continueItems.length && !views.length ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading your collection…</p>
            </div>
          ) : (
            <>
              <Section
                title="Continue Watching"
                subtitle={continueItems.length ? 'Pick up where you left off' : undefined}
                empty={!continueItems.length}
              >
                <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x scroll-smooth">
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

              <Section
                title="Your Libraries"
                subtitle="Jump into a collection"
                empty={!views.length}
              >
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                  {views.map((v) => (
                    <LibraryEntryCard key={v.Id} view={v} onOpen={() => void openLibrary(v)} />
                  ))}
                </div>
              </Section>

              <Section
                title="Recommended for You"
                subtitle="From your family"
                empty={!myMediaRecommendations.length}
              >
                <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-1 px-1">
                  {myMediaRecommendations.map((rec) => {
                    const from = members.find((m) => m.id === rec.fromMemberId);
                    return (
                      <div key={rec.id} className="shrink-0 w-[9.5rem] sm:w-[11rem] space-y-1.5">
                        <button
                          type="button"
                          onClick={() => void openMediaRecommendation(rec)}
                          className="w-full text-left group"
                        >
                          <div
                            className="relative aspect-[2/3] overflow-hidden bg-surface-2 border border-border"
                            style={{
                              borderRadius: 'var(--app-card-radius, 1rem)',
                              boxShadow: 'var(--app-shadow-card)',
                            }}
                          >
                            {embyUserId ? (
                              <img
                                src={`/api/emby/Items/${encodeURIComponent(rec.embyItemId)}/Images/Primary?maxWidth=360`}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : null}
                            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent">
                              <p className="text-[10px] font-semibold text-white line-clamp-2">
                                {from ? `${from.name} recommended` : 'Recommended'}
                              </p>
                            </div>
                          </div>
                          <p className="mt-1.5 text-sm font-semibold text-fg line-clamp-2">{rec.title}</p>
                          {rec.message ? (
                            <p className="text-[11px] text-muted line-clamp-2">"{rec.message}"</p>
                          ) : null}
                          {rec.mediaType ? (
                            <p className="text-[10px] text-muted capitalize">{rec.mediaType}</p>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-muted hover:text-fg inline-flex items-center gap-1"
                          onClick={() => dismissMediaRecommendation(rec.id)}
                        >
                          <X className="w-3 h-3" />
                          Dismiss
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {recUnavailable && (
                <p className="text-sm text-warn bg-warn/10 rounded-xl px-3 py-2" role="status">
                  {recUnavailable}
                </p>
              )}

              {views.filter(showEmbyLatestRow).map((view) => {
                const items = latestByView[view.Id] || [];
                if (!items.length) return null;
                return (
                  <Section key={view.Id} title={`Latest in ${view.Name}`} empty={false}>
                    <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-1 px-1">
                      {items.map((item) => (
                        <MediaCard key={item.Id} item={item} onOpen={() => void openFocus(item)} />
                      ))}
                    </div>
                  </Section>
                );
              })}

              {!loading && !error && !continueItems.length && !views.length && (
                <EmptyState
                  icon={Film}
                  title="Nothing to show yet"
                  body="This profile’s media account has no libraries yet. A parent can check library access in Settings."
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ── LIBRARIES / BROWSE ── */}
      {tab === 'libraries' && (
        <div className="space-y-4">
          {(browse.kind !== 'root' || browseOrigin === 'home') && (
            <button
              type="button"
              onClick={handleBackToOrigin}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              {browse.kind === 'root' ? 'Home' : 'Back'}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {browse.kind === 'library'
                    ? 'Library'
                    : browse.item.Type === 'Series'
                      ? 'Series'
                      : browse.item.Type === 'Season'
                        ? 'Season'
                        : browse.item.Type || 'Folder'}
                </p>
                <h2 className="text-2xl font-bold text-fg tracking-tight mt-0.5">
                  {browse.kind === 'library' ? browse.view.Name : browse.title}
                </h2>
                {detailTotal > 0 && (
                  <p className="text-sm text-muted mt-1">
                    {detailTotal} {detailTotal === 1 ? 'title' : 'titles'}
                  </p>
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

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl">
        <div>
          <h2 className="text-sm font-bold text-fg tracking-tight">Comics</h2>
          <p className="text-xs text-muted mt-0.5">Your family comic library</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setView('comics')}>
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
                      Open externally
                    </Button>
                    {otherMembers.length > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRecommendTarget(focus);
                          setRecommendToId(otherMembers[0]?.id || '');
                          setRecommendMsg('');
                        }}
                      >
                        <Share2 className="w-4 h-4" />
                        Recommend
                      </Button>
                    )}
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

      {/* Recommend to family member */}
      <Modal
        open={!!recommendTarget}
        onClose={() => !recommendBusy && setRecommendTarget(null)}
        title={recommendTarget ? `Recommend ${shortTitle(recommendTarget)}` : 'Recommend'}
      >
        {recommendTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Send this title to someone in the family. They&apos;ll see it under{' '}
              <span className="font-semibold text-fg">Recommended for You</span>. Emby still
              controls whether they can play it.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">Who?</p>
              <div className="flex flex-wrap gap-2">
                {otherMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setRecommendToId(m.id)}
                    className={
                      recommendToId === m.id
                        ? 'px-3 py-1.5 rounded-xl text-sm font-semibold bg-accent text-accent-ink'
                        : 'px-3 py-1.5 rounded-xl text-sm font-semibold border border-border text-fg hover:border-accent/40'
                    }
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                Message (optional)
              </span>
              <Input
                value={recommendMsg}
                onChange={(e) => setRecommendMsg(e.target.value.slice(0, 280))}
                placeholder="You'd love this one!"
                maxLength={280}
              />
            </label>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!recommendToId || recommendBusy}
                onClick={sendMediaRecommendation}
              >
                {recommendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                Recommend
              </Button>
              <Button variant="secondary" disabled={recommendBusy} onClick={() => setRecommendTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {recommendFlash && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[180] rounded-xl bg-elevated border border-border shadow-lg px-4 py-2 text-sm font-semibold text-fg">
          {recommendFlash}
        </div>
      )}
    </div>
  );
}
