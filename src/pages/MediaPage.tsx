import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Film, Link2Off, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
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
  komgaBookWebLink,
  komgaInProgress,
  komgaLibraries,
  komgaLibraryWebLink,
  komgaOnDeck,
  resolveKomgaWebUrl,
  type KomgaBook,
  type KomgaLibrary,
} from '../lib/komga';

export function MediaPage() {
  const { data, update, currentUser, isParent } = useApp();
  const settings = data.settings;
  const webUrl = resolveEmbyWebUrl(settings);
  const komgaWeb = resolveKomgaWebUrl(settings);
  const me = currentUser || data.members.find((m) => m.id === settings.currentUserId);
  const embyUserId = me?.embyUserId?.trim() || '';

  const [serverId, setServerId] = useState(settings.emby?.serverId || '');
  const [resume, setResume] = useState<EmbyItem[]>([]);
  const [views, setViews] = useState<EmbyView[]>([]);
  const [embyLoading, setEmbyLoading] = useState(false);
  const [embyError, setEmbyError] = useState<string | null>(null);

  const [inProgress, setInProgress] = useState<KomgaBook[]>([]);
  const [onDeck, setOnDeck] = useState<KomgaBook[]>([]);
  const [libraries, setLibraries] = useState<KomgaLibrary[]>([]);
  const [komgaLoading, setKomgaLoading] = useState(false);
  const [komgaError, setKomgaError] = useState<string | null>(null);

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
                  emby: {
                    ...d.settings.emby,
                    webUrl: resolveEmbyWebUrl(d.settings),
                    serverId: sid,
                  },
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
      const [prog, deck, libs] = await Promise.all([
        komgaInProgress(12),
        komgaOnDeck(12),
        komgaLibraries(),
      ]);
      setInProgress(prog);
      setOnDeck(deck);
      setLibraries(libs);
    } catch (e) {
      setKomgaError(e instanceof Error ? e.message : 'Failed to load Komga data');
      setInProgress([]);
      setOnDeck([]);
      setLibraries([]);
    } finally {
      setKomgaLoading(false);
    }
  };

  useEffect(() => {
    void loadEmby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embyUserId]);

  useEffect(() => {
    void loadKomga();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openItem = (item: EmbyItem) => {
    if (!webUrl || !serverId) {
      if (webUrl) window.open(webUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    openEmbyItem({ webUrl, serverId, itemId: item.Id, tryNative: true });
  };

  const openLibrary = (view: EmbyView) => {
    if (!webUrl) return;
    if (serverId) {
      window.open(embyWebLibraryLink(webUrl, serverId, view.Id), '_blank', 'noopener,noreferrer');
    } else {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const openKomgaBook = (book: KomgaBook) => {
    if (!komgaWeb) return;
    window.open(komgaBookWebLink(komgaWeb, book.id), '_blank', 'noopener,noreferrer');
  };

  const renderBookRow = (books: KomgaBook[], empty: string) => {
    if (komgaLoading && books.length === 0) {
      return <p className="text-sm text-muted py-6 text-center">Loading…</p>;
    }
    if (books.length === 0) {
      return <p className="text-sm text-muted py-4 text-center">{empty}</p>;
    }
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {books.map((b) => {
          const pct = bookProgressPercent(b);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => openKomgaBook(b)}
              className="snap-start shrink-0 w-28 sm:w-32 text-left group"
              disabled={!komgaWeb}
            >
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
                <img
                  src={komgaBookThumbUrl(b.id)}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {pct > 0 && pct < 100 && (
                  <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40">
                    <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs sm:text-sm font-medium text-fg line-clamp-2 leading-snug">
                {bookTitle(b)}
              </p>
              {pct > 0 && pct < 100 && (
                <p className="text-[11px] text-muted">{Math.round(pct)}%</p>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Media</h1>
        <p className="text-sm text-muted mt-1">Continue watching & reading</p>
      </div>

      {/* Emby */}
      <Card className="space-y-4 !p-4 sm:!p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            <Film className="w-6 h-6 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Emby</h2>
            <p className="text-xs text-muted truncate">
              {webUrl || 'Web URL not set'}
              {me?.name ? ` · ${me.name}` : ''}
            </p>
          </div>
          {embyUserId && (
            <Button size="sm" variant="secondary" onClick={() => void loadEmby()} disabled={embyLoading}>
              <RefreshCw className={`w-4 h-4 ${embyLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {webUrl && (
            <a href={webUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary">
                Open <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
        </div>

        {!embyUserId ? (
          <div className="rounded-xl border border-border bg-surface-2/50 px-4 py-6 text-center space-y-2">
            <Link2Off className="w-8 h-8 text-muted mx-auto" />
            <p className="text-sm font-medium text-fg">Not linked yet</p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              {isParent
                ? 'Link each profile’s Emby User ID under Settings → Media Servers.'
                : 'Ask a parent to link your Emby account in Settings.'}
            </p>
          </div>
        ) : embyError ? (
          <div className="rounded-xl border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">
            {embyError}
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-fg mb-2">Continue Watching</h3>
              {embyLoading && resume.length === 0 ? (
                <p className="text-sm text-muted py-6 text-center">Loading…</p>
              ) : resume.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Nothing in progress right now.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                  {resume.map((item) => {
                    const pct = playedPercent(item);
                    return (
                      <button
                        key={item.Id}
                        type="button"
                        onClick={() => openItem(item)}
                        className="snap-start shrink-0 w-36 sm:w-40 text-left group"
                      >
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
                          <img
                            src={embyImageUrl(item.Id, 240)}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                            loading="lazy"
                          />
                          {pct > 0 && (
                            <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/40">
                              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs sm:text-sm font-medium text-fg line-clamp-2 leading-snug">
                          {displayTitle(item)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {views.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-fg mb-2">Libraries</h3>
                <div className="flex flex-wrap gap-2">
                  {views.map((v) => (
                    <Button key={v.Id} size="sm" variant="secondary" onClick={() => openLibrary(v)} disabled={!webUrl}>
                      {v.Name}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Komga */}
      <Card className="space-y-4 !p-4 sm:!p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Komga</h2>
            <p className="text-xs text-muted truncate">{komgaWeb || 'Web URL not set'}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void loadKomga()} disabled={komgaLoading}>
            <RefreshCw className={`w-4 h-4 ${komgaLoading ? 'animate-spin' : ''}`} />
          </Button>
          {komgaWeb && (
            <a href={komgaWeb} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary">
                Open <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
        </div>

        {komgaError ? (
          <div className="rounded-xl border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">
            {komgaError}
            <p className="text-xs mt-1 opacity-80">
              Set Cloudflare <code className="text-[10px]">KOMGA_BASE_URL</code> +{' '}
              <code className="text-[10px]">KOMGA_API_KEY</code>, redeploy, then try{' '}
              <code className="text-[10px]">/api/komga/v1/libraries</code>.
            </p>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-fg mb-2">Continue Reading</h3>
              {renderBookRow(inProgress, 'Nothing in progress right now.')}
            </div>
            {onDeck.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-fg mb-2">On Deck</h3>
                {renderBookRow(onDeck, '')}
              </div>
            )}
            {libraries.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-fg mb-2">Libraries</h3>
                <div className="flex flex-wrap gap-2">
                  {libraries.map((lib) => (
                    <Button
                      key={lib.id}
                      size="sm"
                      variant="secondary"
                      disabled={!komgaWeb}
                      onClick={() =>
                        window.open(komgaLibraryWebLink(komgaWeb, lib.id), '_blank', 'noopener,noreferrer')
                      }
                    >
                      {lib.name}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!komgaWeb && isParent && !komgaError && (
          <p className="text-xs text-muted">Set Komga web URL in Settings for deep links.</p>
        )}
      </Card>
    </div>
  );
}
