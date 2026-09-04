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

export function MediaPage() {
  const { data, update, currentUser, isParent } = useApp();
  const settings = data.settings;
  const webUrl = resolveEmbyWebUrl(settings);
  const komgaUrl = settings.komgaUrl;
  const embedMedia = settings.embedMedia;
  const me = currentUser || data.members.find((m) => m.id === settings.currentUserId);
  const embyUserId = me?.embyUserId?.trim() || '';

  const [serverId, setServerId] = useState(settings.emby?.serverId || '');
  const [resume, setResume] = useState<EmbyItem[]>([]);
  const [views, setViews] = useState<EmbyView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!embyUserId) {
      setResume([]);
      setViews([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let sid = serverId || settings.emby?.serverId || '';
      if (!sid) {
        try {
          const info = await embyPublicInfo();
          sid = info.Id || '';
          if (sid) {
            setServerId(sid);
            // Cache non-secret serverId on settings for deep links
            update((d) => ({
              ...d,
              settings: {
                ...d.settings,
                emby: { ...d.settings.emby, webUrl: resolveEmbyWebUrl(d.settings), serverId: sid },
              },
            }));
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
      setError(e instanceof Error ? e.message : 'Failed to load Emby data');
      setResume([]);
      setViews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embyUserId]);

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

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Media</h1>
          <p className="text-sm text-muted mt-1">Continue watching and family libraries</p>
        </div>
        {embyUserId && (
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
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
          {webUrl && (
            <a href={webUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary">
                Open Emby <ExternalLink className="w-3.5 h-3.5" />
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
                ? 'Link each profile’s Emby User ID under Settings → Media Servers so Continue Watching can load.'
                : 'Ask a parent to link your Emby account in Settings so you can see Continue Watching here.'}
            </p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">
            {error}
            <p className="text-xs mt-1 opacity-80">
              If this is a new deploy, confirm Cloudflare env vars EMBY_BASE_URL and EMBY_API_KEY are set and the
              proxy responds at /api/emby/System/Info/Public.
            </p>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold text-fg mb-2">Continue Watching</h3>
              {loading && resume.length === 0 ? (
                <p className="text-sm text-muted py-6 text-center">Loading…</p>
              ) : resume.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Nothing in progress right now.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                  {resume.map((item) => {
                    const pct = playedPercent(item);
                    const img = embyImageUrl(item.Id, 240);
                    return (
                      <button
                        key={item.Id}
                        type="button"
                        onClick={() => openItem(item)}
                        className="snap-start shrink-0 w-36 sm:w-40 text-left group"
                      >
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 border border-border shadow-sm">
                          <img
                            src={img}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
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
                        {pct > 0 && (
                          <p className="text-[11px] text-muted">{Math.round(pct)}% watched</p>
                        )}
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
                    <Button
                      key={v.Id}
                      size="sm"
                      variant="secondary"
                      onClick={() => openLibrary(v)}
                      disabled={!webUrl}
                    >
                      {v.Name}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!webUrl && isParent && (
          <p className="text-xs text-muted">
            Set Emby web URL in Settings so deep links can open titles in the browser.
          </p>
        )}
      </Card>

      {/* Komga — unchanged */}
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold">Komga</h2>
            <p className="text-xs text-muted truncate max-w-[200px]">{komgaUrl || 'Not configured'}</p>
          </div>
        </div>
        {komgaUrl ? (
          embedMedia ? (
            <iframe
              title="Komga"
              src={komgaUrl}
              className="w-full h-64 rounded-xl border border-border-strong bg-black"
            />
          ) : (
            <a href={komgaUrl} target="_blank" rel="noreferrer">
              <Button className="w-full" variant="secondary">
                Open Komga <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
          )
        ) : (
          <p className="text-sm text-muted">Set Komga URL in Settings.</p>
        )}
      </Card>
    </div>
  );
}
