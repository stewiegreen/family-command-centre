/**
 * Featured "Continue Watching" hero — primary resume target for Media Home.
 * Backdrop + logo + progress + one-tap Play; rest of the queue stays in a rail.
 */
import { Info, Play } from 'lucide-react';
import { Button } from './ui/Button';
import {
  displayTitle,
  embyBackdropUrl,
  embyBestLogoUrl,
  embyEpisodeArtUrl,
  embyPosterUrl,
  embyThumbUrl,
  playedPercent,
  remainingLabel,
  runtimeLabel,
  shortTitle,
  type EmbyItem,
} from '../lib/emby';
import { cn } from '../lib/cn';

function episodeLine(item: EmbyItem): string | null {
  if (item.Type !== 'Episode') return null;
  const parts: string[] = [];
  if (item.ParentIndexNumber != null && item.IndexNumber != null) {
    parts.push(`S${item.ParentIndexNumber}E${item.IndexNumber}`);
  }
  if (item.Name) parts.push(item.Name);
  return parts.length ? parts.join(' · ') : null;
}

export function ContinueHero({
  item,
  onPlay,
  onMore,
}: {
  item: EmbyItem;
  onPlay: () => void;
  onMore: () => void;
}) {
  const pct = playedPercent(item);
  const left = remainingLabel(item);
  const runtime = runtimeLabel(item);
  const logo = embyBestLogoUrl(item, 160);
  const backdrop = embyBackdropUrl(item, 1280);
  /** TV episodes/series use landscape stills; movies use portrait posters. */
  const isTv =
    item.Type === 'Episode' ||
    item.Type === 'Series' ||
    item.Type === 'Season' ||
    Boolean(item.SeriesName && item.Type !== 'Movie');
  const primaryArt = isTv
    ? item.Type === 'Episode'
      ? embyEpisodeArtUrl(item, 720)
      : embyThumbUrl(item, 720)
    : embyPosterUrl(item, 400);
  /** Poster fallback for backdrop onError (always a Primary). */
  const posterFallback = embyPosterUrl(item, 400);
  const seriesOrTitle =
    item.Type === 'Episode' && item.SeriesName ? item.SeriesName : item.Name || 'Untitled';
  const sub = episodeLine(item);
  const actionLabel =
    pct > 0 && pct < 100 ? 'Resume' : item.Type === 'Episode' ? 'Play episode' : 'Play';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-surface-2',
        'min-h-[12.5rem] sm:min-h-[15.5rem] md:min-h-[17rem]',
      )}
    >
      {/* Backdrop */}
      <img
        src={backdrop}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        onError={(e) => {
          const el = e.currentTarget;
          if (el.dataset.fallback === '1') {
            el.style.display = 'none';
            return;
          }
          el.dataset.fallback = '1';
          el.src = posterFallback;
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

      <div className="relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-5 md:p-6 h-full min-h-[12.5rem] sm:min-h-[15.5rem]">
        {/* Primary art: landscape still for TV, portrait poster for movies */}
        <button
          type="button"
          onClick={onMore}
          className={
            isTv
              ? 'hidden sm:block shrink-0 w-[11rem] md:w-[13.5rem] lg:w-[15rem] self-end sm:self-center'
              : 'hidden sm:block shrink-0 w-[6.5rem] sm:w-[7.5rem] md:w-[8.5rem] self-end sm:self-center'
          }
          aria-label={`Details for ${seriesOrTitle}`}
        >
          <img
            src={primaryArt}
            alt=""
            className={
              isTv
                ? 'w-full aspect-video object-cover rounded-xl border border-white/15 shadow-lg shadow-black/40'
                : 'w-full aspect-[2/3] object-cover rounded-xl border border-white/15 shadow-lg shadow-black/40'
            }
            loading="eager"
          />
        </button>

        <div className="flex-1 flex flex-col justify-end min-w-0 pb-0.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300/95 mb-1.5">
            Continue watching
          </p>

          {logo ? (
            <img
              src={logo}
              alt=""
              className="max-h-12 sm:max-h-14 md:max-h-16 max-w-[min(100%,18rem)] w-auto object-contain object-left drop-shadow-md mb-1.5"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight line-clamp-2 drop-shadow">
            {seriesOrTitle}
          </h2>

          {sub ? (
            <p className="mt-1 text-sm sm:text-base text-white/85 line-clamp-1">{sub}</p>
          ) : item.ProductionYear ? (
            <p className="mt-1 text-sm text-white/75">{item.ProductionYear}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-white/80">
            {left ? (
              <span className="font-semibold text-amber-200 tabular-nums">{left}</span>
            ) : runtime ? (
              <span className="tabular-nums">{runtime}</span>
            ) : null}
            {item.OfficialRating ? (
              <>
                <span className="text-white/40">·</span>
                <span className="rounded border border-white/30 px-1 py-0.5 text-[10px] font-semibold tracking-wide">
                  {item.OfficialRating}
                </span>
              </>
            ) : null}
            {item.CommunityRating != null && item.CommunityRating > 0 ? (
              <>
                <span className="text-white/40">·</span>
                <span>★ {item.CommunityRating.toFixed(1)}</span>
              </>
            ) : null}
          </div>

          {pct > 0 && pct < 100 ? (
            <div className="mt-3 max-w-md">
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-white/60 tabular-nums">{Math.round(pct)}% watched</p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="md"
              className="!bg-white !text-black hover:!bg-white/90 !font-bold shadow-lg min-w-[7.5rem]"
              onClick={onPlay}
            >
              <Play className="w-4 h-4 mr-1.5 fill-current" />
              {actionLabel}
            </Button>
            <Button
              size="md"
              variant="secondary"
              className="!bg-white/15 !text-white !border-white/25 hover:!bg-white/25 backdrop-blur-sm"
              onClick={onMore}
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

/** Small helper export for debugging / tests */
export function continueHeroLabel(item: EmbyItem): string {
  return shortTitle(item) || displayTitle(item);
}
