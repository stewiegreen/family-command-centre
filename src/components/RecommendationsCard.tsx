import { useMemo } from 'react';
import { Film, Library, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/Card';
import { komgaBookThumbUrl, komgaSeriesThumbUrl } from '../lib/komga';
import { embyImageUrl } from '../lib/emby';
import { stashRecOpen } from '../lib/familyRecs';
import { cn } from '../lib/cn';
import type { ComicRecommendation, MediaRecommendation, Member } from '../types';

type UnifiedRec = {
  id: string;
  source: 'comic' | 'emby';
  title: string;
  message?: string;
  createdAt: string;
  status: 'unread' | 'opened';
  fromMemberId: string;
  coverUrl: string;
  landscape: boolean;
};

function comicCover(rec: ComicRecommendation, memberId?: string): string {
  if (rec.kind === 'book' && rec.komgaBookId) return komgaBookThumbUrl(rec.komgaBookId, memberId);
  if (rec.komgaSeriesId) return komgaSeriesThumbUrl(rec.komgaSeriesId, memberId);
  if (rec.komgaBookId) return komgaBookThumbUrl(rec.komgaBookId, memberId);
  return '';
}

function embyCover(rec: MediaRecommendation): { url: string; landscape: boolean } {
  const landscape = rec.mediaType === 'Episode';
  return {
    url: embyImageUrl(rec.embyItemId, landscape ? 480 : 240, landscape ? 'Primary' : 'Primary'),
    landscape,
  };
}

export function RecommendationsCard() {
  const { data, currentUser, update, setView, getMember } = useApp();
  const memberId = currentUser?.id || data.settings.currentUserId || '';

  const recs = useMemo<UnifiedRec[]>(() => {
    const comics = (data.comicRecommendations || [])
      .filter((r) => r.toMemberId === memberId && r.status !== 'dismissed')
      .map((r) => ({
        id: r.id,
        source: 'comic' as const,
        title: r.title,
        message: r.message,
        createdAt: r.createdAt,
        status: (r.status === 'unread' ? 'unread' : 'opened') as 'unread' | 'opened',
        fromMemberId: r.fromMemberId,
        coverUrl: comicCover(r, memberId),
        landscape: false,
      }));
    const media = (data.mediaRecommendations || [])
      .filter((r) => r.toMemberId === memberId && r.status !== 'dismissed')
      .map((r) => {
        const art = embyCover(r);
        return {
          id: r.id,
          source: 'emby' as const,
          title: r.title,
          message: r.message,
          createdAt: r.createdAt,
          status: (r.status === 'unread' ? 'unread' : 'opened') as 'unread' | 'opened',
          fromMemberId: r.fromMemberId,
          coverUrl: art.url,
          landscape: art.landscape,
        };
      });
    return [...comics, ...media].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [data.comicRecommendations, data.mediaRecommendations, memberId]);

  const unread = recs.filter((r) => r.status === 'unread').length;

  const dismiss = (rec: UnifiedRec) => {
    update((d) => {
      if (rec.source === 'comic') {
        return {
          ...d,
          comicRecommendations: (d.comicRecommendations || []).map((r) =>
            r.id === rec.id ? { ...r, status: 'dismissed' as const } : r,
          ),
        };
      }
      return {
        ...d,
        mediaRecommendations: (d.mediaRecommendations || []).map((r) =>
          r.id === rec.id ? { ...r, status: 'dismissed' as const } : r,
        ),
      };
    });
  };

  const open = (rec: UnifiedRec) => {
    update((d) => {
      if (rec.source === 'comic') {
        return {
          ...d,
          comicRecommendations: (d.comicRecommendations || []).map((r) =>
            r.id === rec.id && r.status === 'unread' ? { ...r, status: 'opened' as const } : r,
          ),
        };
      }
      return {
        ...d,
        mediaRecommendations: (d.mediaRecommendations || []).map((r) =>
          r.id === rec.id && r.status === 'unread' ? { ...r, status: 'opened' as const } : r,
        ),
      };
    });
    stashRecOpen({ source: rec.source, id: rec.id });
    setView(rec.source === 'comic' ? 'comics' : 'media');
  };

  const fromOf = (id: string): Member | undefined => {
    try {
      return getMember(id);
    } catch {
      return data.members.find((m) => m.id === id);
    }
  };

  return (
    <Card className="!p-4 h-full flex flex-col min-h-[16rem]">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-accent/15 text-accent">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-fg text-lg leading-tight">Recommended</h3>
          <p className="text-[11px] text-muted truncate">Comics and media from your family</p>
        </div>
        {unread > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wide bg-accent text-accent-ink rounded-full px-2 py-0.5">
            {unread} new
          </span>
        )}
      </div>

      {recs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-4">
          <p className="text-sm text-muted max-w-[16rem]">
            Nothing yet. Family can recommend a comic or a movie from Comics and Media.
          </p>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setView('comics')}
              className="text-[11px] text-accent hover:underline"
            >
              Comics
            </button>
            <span className="text-faint">·</span>
            <button
              type="button"
              onClick={() => setView('media')}
              className="text-[11px] text-accent hover:underline"
            >
              Media
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-[9rem] flex gap-3 overflow-x-auto overflow-y-hidden items-stretch px-0.5 -mx-0.5">
            {recs.map((rec) => {
              const from = fromOf(rec.fromMemberId);
              return (
                <div
                  key={`${rec.source}-${rec.id}`}
                  className="h-full max-h-full shrink-0 flex flex-col text-left group relative"
                >
                  <button
                    type="button"
                    onClick={() => open(rec)}
                    className="h-full min-h-0 flex flex-col text-left"
                    aria-label={`${rec.title} — ${rec.source === 'comic' ? 'comic' : 'media'}`}
                  >
                    <div
                      className={cn(
                        'relative rounded-lg overflow-hidden bg-surface-2 border border-border shadow-sm min-h-0',
                      )}
                      style={{
                        height: 'calc(100% - 3.4rem)',
                        aspectRatio: rec.landscape ? '16 / 9' : '2 / 3',
                        width: 'auto',
                        minWidth: rec.landscape ? '8.5rem' : '5.5rem',
                      }}
                    >
                      {rec.coverUrl ? (
                        <img
                          src={rec.coverUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      <span
                        className={cn(
                          'absolute top-1.5 left-1.5 rounded-full text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide',
                          rec.source === 'comic'
                            ? 'bg-amber-500 text-black'
                            : 'bg-sky-500 text-white',
                        )}
                      >
                        {rec.source === 'comic' ? 'Comic' : 'Media'}
                      </span>
                      {rec.status === 'unread' && (
                        <span className="absolute top-1.5 right-1.5 rounded-full bg-accent text-accent-ink text-[9px] font-bold px-1.5 py-0.5">
                          New
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-fg line-clamp-2 leading-snug max-w-[7.5rem]">
                      {rec.title}
                    </p>
                    <p className="text-[10px] text-muted truncate max-w-[7.5rem]">
                      {from?.name || 'Family'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(rec);
                    }}
                    className="absolute top-1 right-1 p-1 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Dismiss"
                    aria-label="Dismiss recommendation"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setView('comics')}
              className="text-[11px] text-muted hover:text-fg inline-flex items-center gap-1"
            >
              <Library className="w-3 h-3" />
              Comics
            </button>
            <button
              type="button"
              onClick={() => setView('media')}
              className="text-[11px] text-muted hover:text-fg inline-flex items-center gap-1"
            >
              <Film className="w-3 h-3" />
              Media
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
