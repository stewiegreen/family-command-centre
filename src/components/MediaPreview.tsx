/**
 * In-rail media preview — hover (desktop) or long-press (touch) without leaving the shelf.
 * Prefetches full Emby item for overview when opened.
 */
import { useEffect, useState } from 'react';
import { Info, Play, X } from 'lucide-react';
import { Button } from './ui/Button';
import {
  displayTitle,
  embyEpisodeArtUrl,
  embyItem,
  embyPosterUrl,
  embyThumbUrl,
  playedPercent,
  remainingLabel,
  runtimeLabel,
  type EmbyItem,
} from '../lib/emby';
import { cn } from '../lib/cn';

function isTvItem(item: EmbyItem): boolean {
  return (
    item.Type === 'Episode' ||
    item.Type === 'Series' ||
    item.Type === 'Season' ||
    Boolean(item.SeriesName && item.Type !== 'Movie')
  );
}

function previewArt(item: EmbyItem): string {
  if (item.Type === 'Episode') return embyEpisodeArtUrl(item, 640);
  if (isTvItem(item)) return embyThumbUrl(item, 640);
  return embyPosterUrl(item, 400);
}

export function MediaPreview({
  item,
  userId,
  open,
  onClose,
  onPlay,
  onMore,
}: {
  item: EmbyItem | null;
  userId: string | undefined;
  open: boolean;
  onClose: () => void;
  onPlay: (item: EmbyItem) => void;
  onMore: (item: EmbyItem) => void;
}) {
  const [full, setFull] = useState<EmbyItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item || !userId) {
      setFull(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFull(item);
    void embyItem(userId, item.Id)
      .then((detail) => {
        if (!cancelled) setFull(detail);
      })
      .catch(() => {
        /* keep list item */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item?.Id, userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !item) return null;

  const show = full || item;
  const pct = playedPercent(show);
  const left = remainingLabel(show);
  const runtime = runtimeLabel(show);
  const overview = (show.Overview || '').trim();
  const title = displayTitle(show);
  const art = previewArt(show);
  const landscape = isTvItem(show) || show.Type === 'Episode';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full sm:max-w-lg bg-surface border border-border shadow-2xl overflow-hidden',
          'rounded-t-3xl sm:rounded-2xl max-h-[88dvh] flex flex-col',
          'animate-in fade-in duration-150',
        )}
      >
        <div className="relative shrink-0">
          <img
            src={art}
            alt=""
            className={cn(
              'w-full object-cover bg-surface-2',
              landscape ? 'aspect-video max-h-[40vh]' : 'aspect-[2/3] max-h-[42vh] sm:max-h-[320px] object-top mx-auto sm:w-auto sm:rounded-none',
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-black/20 pointer-events-none" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-fg leading-snug">{title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {show.ProductionYear ? <span>{show.ProductionYear}</span> : null}
              {runtime ? (
                <>
                  {show.ProductionYear ? <span className="text-border-strong">·</span> : null}
                  <span className="tabular-nums">{runtime}</span>
                </>
              ) : null}
              {left && pct > 0 && pct < 100 ? (
                <>
                  <span className="text-border-strong">·</span>
                  <span className="text-accent font-semibold tabular-nums">{left}</span>
                </>
              ) : null}
              {show.OfficialRating ? (
                <>
                  <span className="text-border-strong">·</span>
                  <span className="rounded border border-border px-1 py-0.5 text-[10px] font-semibold">
                    {show.OfficialRating}
                  </span>
                </>
              ) : null}
              {show.CommunityRating != null && show.CommunityRating > 0 ? (
                <>
                  <span className="text-border-strong">·</span>
                  <span>★ {show.CommunityRating.toFixed(1)}</span>
                </>
              ) : null}
              {loading ? <span className="text-muted">Updating…</span> : null}
            </div>
          </div>

          {pct > 0 && pct < 100 ? (
            <div>
              <div className="h-1.5 rounded-full bg-inset overflow-hidden">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted tabular-nums">{Math.round(pct)}% watched</p>
            </div>
          ) : null}

          {overview ? (
            <p className="text-sm text-fg-secondary leading-relaxed line-clamp-5">{overview}</p>
          ) : (
            <p className="text-sm text-muted italic">No synopsis available.</p>
          )}

          {show.Genres && show.Genres.length > 0 ? (
            <p className="text-[11px] text-muted line-clamp-1">{show.Genres.slice(0, 4).join(' · ')}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              className="!font-bold min-w-[7rem]"
              onClick={() => {
                onPlay(show);
                onClose();
              }}
            >
              <Play className="w-4 h-4 mr-1.5 fill-current" />
              {pct > 0 && pct < 100 ? 'Resume' : 'Play'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onMore(show);
                onClose();
              }}
            >
              <Info className="w-4 h-4 mr-1.5" />
              More info
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
