/** Client helpers for the Emby proxy at /api/emby/* — never talk to Emby directly. */
import type { Settings } from '../types';

const PROXY = '/api/emby';

const DETAIL_FIELDS =
  'Overview,UserData,PrimaryImageAspectRatio,SeriesName,ProductionYear,ChildCount,RecursiveItemCount,RunTimeTicks,OfficialRating,Genres,CommunityRating,ParentId,SeasonName,IndexNumber,ParentIndexNumber,ParentLogoItemId,ParentLogoImageTag,ParentBackdropItemId,ParentBackdropImageTags,SeriesPrimaryImageTag,SeriesId,AlbumArtist,Artists,Album,AlbumId';

export type EmbyUserData = {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
  UnplayedItemCount?: number;
};

export type EmbyItem = {
  Id: string;
  Name: string;
  Type?: string;
  MediaType?: string;
  SeriesName?: string;
  SeasonName?: string;
  ProductionYear?: number;
  Overview?: string;
  OfficialRating?: string;
  CommunityRating?: number;
  Genres?: string[];
  RunTimeTicks?: number;
  ChildCount?: number;
  RecursiveItemCount?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ParentId?: string;
  UserData?: EmbyUserData;
  ImageTags?: {
    Primary?: string;
    Backdrop?: string;
    Thumb?: string;
    Logo?: string;
    Banner?: string;
  };
  PrimaryImageItemId?: string;
  SeriesId?: string;
  SeriesPrimaryImageTag?: string;
  ParentLogoItemId?: string;
  ParentLogoImageTag?: string;
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  CollectionType?: string;
  Artists?: string[];
  AlbumArtist?: string;
  Album?: string;
  AlbumId?: string;
};

export type EmbyItemsResponse = {
  Items?: EmbyItem[];
  TotalRecordCount?: number;
};

export type EmbyView = {
  Id: string;
  Name: string;
  CollectionType?: string;
};

export type EmbyViewsResponse = {
  Items?: EmbyView[];
};

export type EmbyPublicInfo = {
  Id?: string;
  ServerName?: string;
  Version?: string;
};

async function proxyGet<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const full = new URL(
    `${PROXY}/${path.replace(/^\//, '')}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://local',
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') full.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(full.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Emby proxy ${res.status}: ${text || res.statusText}`);
  }
  // Images are binary — callers of image URLs don't use this
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json') || ct.includes('text/json') || ct.includes('text/plain')) {
    return res.json() as Promise<T>;
  }
  return res.json() as Promise<T>;
}

export async function embyViews(userId: string): Promise<EmbyView[]> {
  const data = await proxyGet<EmbyViewsResponse>(`Users/${encodeURIComponent(userId)}/Views`);
  return data.Items || [];
}

export async function embyResume(userId: string, limit = 16): Promise<EmbyItem[]> {
  const data = await proxyGet<EmbyItemsResponse>(`Users/${encodeURIComponent(userId)}/Items/Resume`, {
    MediaTypes: 'Video',
    Limit: limit,
    Fields: DETAIL_FIELDS,
  });
  return data.Items || [];
}

export async function embyLatest(
  userId: string,
  limit = 16,
  parentId?: string,
): Promise<EmbyItem[]> {
  const data = await proxyGet<EmbyItemsResponse | EmbyItem[]>(
    `Users/${encodeURIComponent(userId)}/Items/Latest`,
    { Limit: limit, Fields: DETAIL_FIELDS, ParentId: parentId },
  );
  if (Array.isArray(data)) return data;
  return data.Items || [];
}

/** Next unwatched episode in series the user is following. */
export async function embyNextUp(userId: string, limit = 16): Promise<EmbyItem[]> {
  const data = await proxyGet<EmbyItemsResponse>('Shows/NextUp', {
    UserId: userId,
    Limit: limit,
    Fields: DETAIL_FIELDS,
  });
  return data.Items || [];
}

export async function embyItem(userId: string, itemId: string): Promise<EmbyItem> {
  return proxyGet<EmbyItem>(
    `Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}`,
    { Fields: DETAIL_FIELDS },
  );
}

export type EmbyItemsQuery = {
  parentId?: string;
  includeItemTypes?: string;
  recursive?: boolean;
  sortBy?: string;
  sortOrder?: 'Ascending' | 'Descending';
  searchTerm?: string;
  filters?: string;
  limit?: number;
  startIndex?: number;
};

export async function embyItems(
  userId: string,
  q: EmbyItemsQuery = {},
): Promise<{ items: EmbyItem[]; total: number }> {
  const data = await proxyGet<EmbyItemsResponse>(`Users/${encodeURIComponent(userId)}/Items`, {
    ParentId: q.parentId,
    IncludeItemTypes: q.includeItemTypes,
    Recursive: q.recursive === undefined ? undefined : q.recursive ? 'true' : 'false',
    SortBy: q.sortBy || 'SortName',
    SortOrder: q.sortOrder || 'Ascending',
    SearchTerm: q.searchTerm,
    Filters: q.filters,
    Limit: q.limit ?? 40,
    StartIndex: q.startIndex ?? 0,
    Fields: DETAIL_FIELDS,
    EnableUserData: 'true',
  });
  return { items: data.Items || [], total: data.TotalRecordCount ?? data.Items?.length ?? 0 };
}

/**
 * Client-side ordering safety net when Emby returns mixed order.
 * Prefers season → episode index, then track index, then numeric name.
 */
function nameCompare(a: EmbyItem, b: EmbyItem): number {
  const an = (a.Name || a.SeriesName || '').trim();
  const bn = (b.Name || b.SeriesName || '').trim();
  return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Client-side ordering after Emby returns a page.
 * - Episodes / seasons / album tracks → index order (then name)
 * - Everything else (movies, series, artists, box sets, …) → alphabetical by name
 *   so library roots stay A–Z instead of being reshuffled by year/index.
 */
export function sortMediaItems(items: EmbyItem[]): EmbyItem[] {
  return [...items].sort((a, b) => {
    const ta = (a.Type || '').toLowerCase();
    const tb = (b.Type || '').toLowerCase();

    const aEpisodic =
      ta === 'episode' ||
      ta === 'season' ||
      (ta === 'audio' && a.IndexNumber != null) ||
      (a.ParentIndexNumber != null && a.IndexNumber != null && ta !== 'movie' && ta !== 'series');
    const bEpisodic =
      tb === 'episode' ||
      tb === 'season' ||
      (tb === 'audio' && b.IndexNumber != null) ||
      (b.ParentIndexNumber != null && b.IndexNumber != null && tb !== 'movie' && tb !== 'series');

    if (aEpisodic && bEpisodic) {
      const ap = a.ParentIndexNumber;
      const bp = b.ParentIndexNumber;
      if (ap != null && bp != null && ap !== bp) return ap - bp;

      const ai = a.IndexNumber;
      const bi = b.IndexNumber;
      if (ai != null && bi != null && ai !== bi) return ai - bi;
      if (ai != null && bi == null) return -1;
      if (ai == null && bi != null) return 1;
      return nameCompare(a, b);
    }

    // Prefer keeping episodic items in index groups only when both are episodic.
    // Movies, Series, MusicArtist, BoxSet, folders at library root → A–Z.
    return nameCompare(a, b);
  });
}

/** Emby SortBy string for a parent folder / library context. */
export function embySortByForParent(opts: {
  parentType?: string;
  collectionType?: string;
}): string {
  const type = (opts.parentType || '').toLowerCase();
  const col = (opts.collectionType || '').toLowerCase();

  // Inside a series → seasons; inside a season → episodes; album → tracks
  if (type === 'series' || type === 'season' || type === 'musicalbum') {
    return 'IndexNumber,SortName';
  }
  // Box set: often watched in release order; still secondary by name
  if (type === 'boxset') return 'ProductionYear,SortName';

  // Generic folders under a library (genre packs, etc.) → alphabetical
  if (type === 'folder' || type === 'collectionfolder') return 'SortName';

  // Library roots — always A–Z by SortName (movies, TV, music artists, playlists, …)
  if (
    col === 'movies' ||
    col === 'tvshows' ||
    col === 'homevideos' ||
    col === 'music' ||
    col === 'musicvideos' ||
    col === 'boxsets' ||
    col === 'playlists' ||
    col === 'folders'
  ) {
    return 'SortName';
  }

  // Unknown parent: alphabetical is safer than index (avoids scrambled movie grids)
  return 'SortName';
}

export async function embyChildren(
  userId: string,
  parentId: string,
  opts: {
    limit?: number;
    startIndex?: number;
    includeItemTypes?: string;
    /** Emby parent Type (Series, Season, …) for correct ordering */
    parentType?: string;
    sortBy?: string;
  } = {},
): Promise<{ items: EmbyItem[]; total: number }> {
  const sortBy =
    opts.sortBy ||
    embySortByForParent({ parentType: opts.parentType });
  const result = await embyItems(userId, {
    parentId,
    recursive: false,
    sortBy,
    sortOrder: 'Ascending',
    limit: opts.limit ?? 60,
    startIndex: opts.startIndex ?? 0,
    includeItemTypes: opts.includeItemTypes,
  });
  return {
    items: sortMediaItems(result.items),
    total: result.total,
  };
}

/**
 * Album artists for a music library — Emby MusicArtist entities, not filesystem folders.
 * Uses IncludeItemTypes=MusicArtist (Album Artist metadata). Falls back to empty if none.
 */
export async function embyMusicArtists(
  userId: string,
  libraryId: string,
  opts: { limit?: number; startIndex?: number } = {},
): Promise<{ items: EmbyItem[]; total: number }> {
  return embyItems(userId, {
    parentId: libraryId,
    includeItemTypes: 'MusicArtist',
    recursive: true,
    sortBy: 'SortName',
    sortOrder: 'Ascending',
    limit: opts.limit ?? 48,
    startIndex: opts.startIndex ?? 0,
  });
}

/**
 * Albums for a MusicArtist (Album Artist). Prefers MusicAlbum items.
 */
export async function embyArtistAlbums(
  userId: string,
  artistId: string,
  opts: { limit?: number; startIndex?: number } = {},
): Promise<{ items: EmbyItem[]; total: number }> {
  // Direct children first
  const direct = await embyItems(userId, {
    parentId: artistId,
    includeItemTypes: 'MusicAlbum',
    recursive: false,
    sortBy: 'ProductionYear,SortName',
    sortOrder: 'Ascending',
    limit: opts.limit ?? 48,
    startIndex: opts.startIndex ?? 0,
  });
  if (direct.items.length) return direct;
  // Some libraries only link albums via recursive query
  return embyItems(userId, {
    parentId: artistId,
    includeItemTypes: 'MusicAlbum',
    recursive: true,
    sortBy: 'ProductionYear,SortName',
    sortOrder: 'Ascending',
    limit: opts.limit ?? 48,
    startIndex: opts.startIndex ?? 0,
  });
}


export async function embySearch(
  userId: string,
  term: string,
  limit = 40,
): Promise<EmbyItem[]> {
  const t = term.trim();
  if (!t) return [];
  const { items } = await embyItems(userId, {
    searchTerm: t,
    recursive: true,
    includeItemTypes: 'Movie,Series,Episode',
    limit,
    sortBy: 'SortName',
  });
  return items;
}

export async function embyPublicInfo(): Promise<EmbyPublicInfo> {
  return proxyGet<EmbyPublicInfo>('System/Info/Public');
}

export type EmbyImageType = 'Primary' | 'Backdrop' | 'Thumb' | 'Logo' | 'Banner';

export type EmbyImageOpts = {
  type?: EmbyImageType;
  maxWidth?: number;
  maxHeight?: number;
  fillWidth?: number;
  fillHeight?: number;
  tag?: string;
  /** For Logo — helps Emby crop whitespace */
  background?: string;
};

/** Image URL via same-origin proxy (api_key never leaves the edge). */
export function embyImageUrl(itemId: string, opts: EmbyImageOpts | number = 320, imageType: EmbyImageType = 'Primary'): string {
  // Back-compat: embyImageUrl(id, 320) or embyImageUrl(id, 320, 'Thumb')
  let o: EmbyImageOpts;
  if (typeof opts === 'number') {
    o = { maxWidth: opts, type: imageType };
  } else {
    o = opts;
  }
  const type = o.type || 'Primary';
  const q = new URLSearchParams();
  if (o.maxWidth) q.set('maxWidth', String(o.maxWidth));
  if (o.maxHeight) q.set('maxHeight', String(o.maxHeight));
  if (o.fillWidth) q.set('fillWidth', String(o.fillWidth));
  if (o.fillHeight) q.set('fillHeight', String(o.fillHeight));
  if (o.tag) q.set('tag', o.tag);
  if (o.background) q.set('background', o.background);
  if (!o.maxWidth && !o.maxHeight && !o.fillWidth && !o.fillHeight) {
    q.set('maxWidth', '400');
  }
  return `${PROXY}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(type)}?${q}`;
}

/** Continue Watching / resume — prefer Thumb, then Backdrop, then Primary. */
export function embyThumbUrl(item: EmbyItem, maxWidth = 480): string {
  if (item.ImageTags?.Thumb) {
    return embyImageUrl(item.Id, { type: 'Thumb', maxWidth, tag: item.ImageTags.Thumb });
  }
  if (item.ImageTags?.Backdrop) {
    return embyImageUrl(item.Id, { type: 'Backdrop', maxWidth, tag: item.ImageTags.Backdrop });
  }
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0]) {
    return embyImageUrl(item.ParentBackdropItemId, {
      type: 'Backdrop',
      maxWidth,
      tag: item.ParentBackdropImageTags[0],
    });
  }
  return embyImageUrl(item.Id, { type: 'Primary', maxWidth });
}

/**
 * Episode landscape art — Emby Primary on an episode is usually the episode still/screenshot.
 * Prefer that over Thumb/series poster so each episode looks distinct.
 */
export function embyEpisodeArtUrl(item: EmbyItem, maxWidth = 640): string {
  if (item.ImageTags?.Primary) {
    return embyImageUrl(item.Id, { type: 'Primary', maxWidth, tag: item.ImageTags.Primary });
  }
  if (item.ImageTags?.Thumb) {
    return embyImageUrl(item.Id, { type: 'Thumb', maxWidth, tag: item.ImageTags.Thumb });
  }
  if (item.ImageTags?.Backdrop) {
    return embyImageUrl(item.Id, { type: 'Backdrop', maxWidth, tag: item.ImageTags.Backdrop });
  }
  // Last resort: series backdrop / primary (better than blank)
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0]) {
    return embyImageUrl(item.ParentBackdropItemId, {
      type: 'Backdrop',
      maxWidth,
      tag: item.ParentBackdropImageTags[0],
    });
  }
  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return embyImageUrl(item.SeriesId, { type: 'Primary', maxWidth, tag: item.SeriesPrimaryImageTag });
  }
  return embyImageUrl(item.Id, { type: 'Primary', maxWidth });
}

/** Portrait poster for Latest / library grids. */
export function embyPosterUrl(item: EmbyItem, maxWidth = 320): string {
  if (item.ImageTags?.Primary) {
    return embyImageUrl(item.Id, { type: 'Primary', maxWidth, tag: item.ImageTags.Primary });
  }
  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return embyImageUrl(item.SeriesId, { type: 'Primary', maxWidth, tag: item.SeriesPrimaryImageTag });
  }
  return embyImageUrl(item.Id, { type: 'Primary', maxWidth });
}

/** Detail hero backdrop. */
export function embyBackdropUrl(item: EmbyItem, maxWidth = 1280): string {
  if (item.ImageTags?.Backdrop) {
    return embyImageUrl(item.Id, { type: 'Backdrop', maxWidth, tag: item.ImageTags.Backdrop });
  }
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0]) {
    return embyImageUrl(item.ParentBackdropItemId, {
      type: 'Backdrop',
      maxWidth,
      tag: item.ParentBackdropImageTags[0],
    });
  }
  return embyPosterUrl(item, maxWidth);
}

/**
 * Logo as visual title — item logo → parent/series logo → null (caller uses text).
 */
export function embyBestLogoUrl(item: EmbyItem, maxHeight = 96): string | null {
  if (item.ImageTags?.Logo) {
    return embyImageUrl(item.Id, {
      type: 'Logo',
      maxHeight,
      tag: item.ImageTags.Logo,
      background: 'transparent',
    });
  }
  if (item.ParentLogoItemId && item.ParentLogoImageTag) {
    return embyImageUrl(item.ParentLogoItemId, {
      type: 'Logo',
      maxHeight,
      tag: item.ParentLogoImageTag,
      background: 'transparent',
    });
  }
  return null;
}


/** Libraries that get a "Latest …" row on Media home (movies/TV-style only). */
export function showEmbyLatestRow(view: EmbyView): boolean {
  const t = (view.CollectionType || '').toLowerCase();
  const name = (view.Name || '').toLowerCase();
  // Explicitly excluded per family preference
  if (['music', 'musicvideos', 'livetv', 'photos', 'photovideos'].includes(t)) return false;
  if (
    name.includes('music') ||
    name.includes('classical') ||
    name.includes('live tv') ||
    name.includes('recording') ||
    name.includes('photo')
  ) {
    return false;
  }
  // Prefer movies / TV / box sets; allow unnamed generic folders that aren't the above
  if (t === 'movies' || t === 'tvshows' || t === 'boxsets') return true;
  if (!t || t === 'folders' || t === 'mixed') return true;
  return false;
}

export function libraryKindLabel(view: EmbyView): string {
  const t = (view.CollectionType || '').toLowerCase();
  if (t === 'movies') return 'Movies';
  if (t === 'tvshows') return 'TV';
  if (t === 'music') return 'Music';
  if (t === 'homevideos' || t === 'homevideos') return 'Home videos';
  if (t === 'boxsets') return 'Collections';
  if (t === 'playlists') return 'Playlists';
  if (t === 'livetv') return 'Live TV';
  return view.Name || 'Library';
}

export function playedPercent(item: EmbyItem): number {
  const ud = item.UserData;
  if (!ud) return 0;
  if (ud.Played) return 100;
  if (typeof ud.PlayedPercentage === 'number') return Math.min(100, Math.max(0, ud.PlayedPercentage));
  return 0;
}

export function displayTitle(item: EmbyItem): string {
  if (item.Type === 'Episode' && item.SeriesName) {
    const ep =
      item.IndexNumber != null
        ? `S${item.ParentIndexNumber ?? '?'}E${item.IndexNumber}`
        : '';
    return ep ? `${item.SeriesName} · ${ep} · ${item.Name}` : `${item.SeriesName} · ${item.Name}`;
  }
  return item.Name || 'Untitled';
}

export function shortTitle(item: EmbyItem): string {
  if (item.Type === 'Episode' && item.SeriesName) {
    if (item.IndexNumber != null) {
      return `${item.SeriesName} · E${item.IndexNumber}`;
    }
    return `${item.SeriesName} · ${item.Name}`;
  }
  return item.Name || 'Untitled';
}

export function runtimeLabel(item: EmbyItem): string | null {
  const ticks = item.RunTimeTicks;
  if (!ticks || ticks <= 0) return null;
  const mins = Math.round(ticks / 600_000_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function remainingLabel(item: EmbyItem): string | null {
  const ticks = item.RunTimeTicks;
  if (!ticks || ticks <= 0) return null;
  const pct = item.UserData?.PlayedPercentage;
  if (pct == null || pct <= 0 || pct >= 100) {
    return runtimeLabel(item);
  }
  const left = Math.round((ticks * (100 - pct)) / 100 / 600_000_000);
  if (left <= 0) return null;
  if (left < 60) return `${left}m left`;
  const h = Math.floor(left / 60);
  const m = left % 60;
  return m ? `${h}h ${m}m left` : `${h}h left`;
}

/**
 * Deep link into Emby web UI. webUrl is the public browser URL (not a secret).
 * serverId from System/Info/Public.
 */
export function embyWebItemLink(webUrl: string, serverId: string, itemId: string): string {
  const base = webUrl.replace(/\/+$/, '');
  return `${base}/web/index.html#!/item?id=${encodeURIComponent(itemId)}&serverId=${encodeURIComponent(serverId)}`;
}

export function embyWebLibraryLink(webUrl: string, serverId: string, parentId: string): string {
  const base = webUrl.replace(/\/+$/, '');
  return `${base}/web/index.html#!/list?serverId=${encodeURIComponent(serverId)}&parentId=${encodeURIComponent(parentId)}`;
}

export function embyAppScheme(serverId: string, itemId: string): string {
  return `emby://items/${encodeURIComponent(serverId)}/${encodeURIComponent(itemId)}`;
}

/**
 * Open title in Emby web (new tab). Native scheme is optional and unreliable in PWAs.
 */
export function openEmbyItem(opts: {
  webUrl: string;
  serverId: string;
  itemId: string;
  tryNative?: boolean;
}): void {
  const web = embyWebItemLink(opts.webUrl, opts.serverId, opts.itemId);
  if (opts.tryNative) {
    const app = embyAppScheme(opts.serverId, opts.itemId);
    window.location.href = app;
    window.setTimeout(() => {
      window.open(web, '_blank', 'noopener,noreferrer');
    }, 700);
    return;
  }
  window.open(web, '_blank', 'noopener,noreferrer');
}

/** Resolve public Emby web URL from settings (supports legacy embyUrl). */
export function resolveEmbyWebUrl(settings: Settings): string {
  return (settings.emby?.webUrl || settings.embyUrl || '').replace(/\/+$/, '');
}

// ─── Playback (Phase B) ───────────────────────────────────────────────

const PROXY_ORIGIN = () =>
  typeof window !== 'undefined' ? window.location.origin : 'http://local';

export type EmbyMediaSource = {
  Id: string;
  Name?: string;
  Container?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  DirectStreamUrl?: string;
  TranscodingUrl?: string;
  RunTimeTicks?: number;
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
  MediaStreams?: { Type?: string; Index?: number; Codec?: string; IsDefault?: boolean }[];
};

export type EmbyPlaybackInfo = {
  MediaSources?: EmbyMediaSource[];
  PlaySessionId?: string;
};

export function embyDeviceId(): string {
  try {
    const key = 'greenhq-emby-device-id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `ghq-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'greenhq-web';
  }
}

export async function embyPlaybackInfo(
  userId: string,
  itemId: string,
): Promise<EmbyPlaybackInfo> {
  return proxyGet<EmbyPlaybackInfo>(`Items/${encodeURIComponent(itemId)}/PlaybackInfo`, {
    UserId: userId,
  });
}

/**
 * Prefer progressive MP4-ish stream through the proxy (works in most browsers
 * when Emby can direct-stream or transcode to a browser-friendly format).
 */
export function embyStreamUrl(opts: {
  itemId: string;
  userId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  startTicks?: number;
  maxBitrate?: number;
  audioStreamIndex?: number;
}): string {
  const q = new URLSearchParams();
  q.set('UserId', opts.userId);
  q.set('DeviceId', embyDeviceId());
  // Static original file often has AC3/DTS audio browsers cannot play → silent video.
  // Prefer container remux when possible; still pass AudioStreamIndex.
  q.set('Static', 'true');
  if (opts.mediaSourceId) q.set('MediaSourceId', opts.mediaSourceId);
  if (opts.playSessionId) q.set('PlaySessionId', opts.playSessionId);
  if (opts.startTicks && opts.startTicks > 0) q.set('StartTimeTicks', String(Math.floor(opts.startTicks)));
  if (opts.maxBitrate) q.set('MaxStreamingBitrate', String(opts.maxBitrate));
  if (opts.audioStreamIndex != null) q.set('AudioStreamIndex', String(opts.audioStreamIndex));
  return `${PROXY}/Videos/${encodeURIComponent(opts.itemId)}/stream?${q.toString()}`;
}


type AudioStreamOpts = {
  itemId: string;
  userId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  startTicks?: number;
};

function audioQuery(opts: AudioStreamOpts, extra?: Record<string, string>): URLSearchParams {
  const q = new URLSearchParams();
  q.set('UserId', opts.userId);
  q.set('DeviceId', embyDeviceId());
  if (opts.mediaSourceId) q.set('MediaSourceId', opts.mediaSourceId);
  if (opts.playSessionId) q.set('PlaySessionId', opts.playSessionId);
  if (opts.startTicks && opts.startTicks > 0) q.set('StartTimeTicks', String(Math.floor(opts.startTicks)));
  if (extra) {
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
  }
  return q;
}

/**
 * Browser-safe audio: ask Emby to transcode/remux to MP3.
 * Required for FLAC (and other formats browsers cannot decode).
 * Do NOT set Static=true — that serves the original file and fails in Chrome/Safari for FLAC.
 */
export function embyAudioTranscodeUrl(opts: AudioStreamOpts): string {
  const q = audioQuery(opts, {
    MaxStreamingBitrate: '320000',
    AudioCodec: 'mp3',
    AudioBitrate: '320000',
    Container: 'mp3',
    TranscodingContainer: 'mp3',
    TranscodingProtocol: 'http',
  });
  // Extension hints content-type for some clients; Emby still selects codec from params
  return `${PROXY}/Audio/${encodeURIComponent(opts.itemId)}/stream.mp3?${q.toString()}`;
}

/** Same idea without .mp3 path suffix (some Emby builds prefer plain /stream). */
export function embyAudioTranscodeStreamUrl(opts: AudioStreamOpts): string {
  const q = audioQuery(opts, {
    MaxStreamingBitrate: '320000',
    AudioCodec: 'mp3',
    AudioBitrate: '320000',
    Container: 'mp3',
    TranscodingContainer: 'mp3',
    TranscodingProtocol: 'http',
  });
  return `${PROXY}/Audio/${encodeURIComponent(opts.itemId)}/stream?${q.toString()}`;
}

/**
 * Emby "universal" audio endpoint — same family as official clients.
 * Tries direct play when the file is already browser-friendly, else transcodes.
 */
export function embyAudioUniversalUrl(opts: AudioStreamOpts): string {
  const q = audioQuery(opts, {
    MaxStreamingBitrate: '140000000',
    // Prefer containers browsers can play; FLAC listed so Emby may direct-play where supported
    Container: 'mp3,aac,m4a,opus,ogg,wav,flac',
    TranscodingContainer: 'mp3',
    TranscodingProtocol: 'http',
    AudioCodec: 'mp3',
  });
  return `${PROXY}/Audio/${encodeURIComponent(opts.itemId)}/universal?${q.toString()}`;
}

/** Direct/static original file — only works for browser-native formats (e.g. some MP3s). */
export function embyAudioStreamUrl(opts: AudioStreamOpts): string {
  const q = audioQuery(opts, { Static: 'true' });
  return `${PROXY}/Audio/${encodeURIComponent(opts.itemId)}/stream?${q.toString()}`;
}

/** Ordered attempts for in-browser album playback. */
export function embyAudioPlayAttempts(opts: AudioStreamOpts): string[] {
  return [
    embyAudioTranscodeUrl(opts),
    embyAudioTranscodeStreamUrl(opts),
    embyAudioUniversalUrl(opts),
    embyAudioStreamUrl(opts),
  ];
}

export function embyHlsUrl(opts: {
  itemId: string;
  userId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  startTicks?: number;
  audioStreamIndex?: number;
}): string {
  const q = new URLSearchParams();
  q.set('UserId', opts.userId);
  q.set('DeviceId', embyDeviceId());
  q.set('VideoCodec', 'h264');
  q.set('AudioCodec', 'aac');
  q.set('MaxStreamingBitrate', '8000000');
  q.set('TranscodingProtocol', 'hls');
  q.set('SegmentContainer', 'ts');
  if (opts.mediaSourceId) q.set('MediaSourceId', opts.mediaSourceId);
  if (opts.playSessionId) q.set('PlaySessionId', opts.playSessionId);
  if (opts.startTicks && opts.startTicks > 0) q.set('StartTimeTicks', String(Math.floor(opts.startTicks)));
  if (opts.audioStreamIndex != null) q.set('AudioStreamIndex', String(opts.audioStreamIndex));
  return `${PROXY}/Videos/${encodeURIComponent(opts.itemId)}/master.m3u8?${q.toString()}`;
}


/**
 * Browser-safe progressive stream: H.264 + AAC in MP4.
 * Use this as the default web path — Static originals often have no usable audio in Chrome.
 */
export function embyTranscodeStreamUrl(opts: {
  itemId: string;
  userId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  startTicks?: number;
  audioStreamIndex?: number;
}): string {
  const q = new URLSearchParams();
  q.set('UserId', opts.userId);
  q.set('DeviceId', embyDeviceId());
  q.set('VideoCodec', 'h264');
  q.set('AudioCodec', 'aac');
  q.set('AudioBitrate', '192000');
  q.set('MaxStreamingBitrate', '8000000');
  q.set('Container', 'mp4');
  q.set('TranscodingContainer', 'mp4');
  q.set('TranscodingProtocol', 'http');
  if (opts.mediaSourceId) q.set('MediaSourceId', opts.mediaSourceId);
  if (opts.playSessionId) q.set('PlaySessionId', opts.playSessionId);
  if (opts.startTicks && opts.startTicks > 0) q.set('StartTimeTicks', String(Math.floor(opts.startTicks)));
  if (opts.audioStreamIndex != null) q.set('AudioStreamIndex', String(opts.audioStreamIndex));
  return `${PROXY}/Videos/${encodeURIComponent(opts.itemId)}/stream.mp4?${q.toString()}`;
}


async function postSession(path: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${PROXY_ORIGIN()}${PROXY}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Non-fatal for progress — playback still works
    console.warn('Emby session post failed', path, res.status);
  }
}

export async function embyReportStart(opts: {
  itemId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  positionTicks?: number;
}): Promise<void> {
  await postSession('Sessions/Playing', {
    ItemId: opts.itemId,
    MediaSourceId: opts.mediaSourceId,
    PlaySessionId: opts.playSessionId,
    PositionTicks: opts.positionTicks ?? 0,
    CanSeek: true,
    IsPaused: false,
    IsMuted: false,
  });
}

export async function embyReportProgress(opts: {
  itemId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  positionTicks: number;
  isPaused?: boolean;
}): Promise<void> {
  await postSession('Sessions/Playing/Progress', {
    ItemId: opts.itemId,
    MediaSourceId: opts.mediaSourceId,
    PlaySessionId: opts.playSessionId,
    PositionTicks: Math.max(0, Math.floor(opts.positionTicks)),
    IsPaused: !!opts.isPaused,
    CanSeek: true,
    IsMuted: false,
  });
}

export async function embyReportStop(opts: {
  itemId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  positionTicks: number;
}): Promise<void> {
  await postSession('Sessions/Playing/Stopped', {
    ItemId: opts.itemId,
    MediaSourceId: opts.mediaSourceId,
    PlaySessionId: opts.playSessionId,
    PositionTicks: Math.max(0, Math.floor(opts.positionTicks)),
  });
}

/** Convert Emby ticks (10M / second) ↔ seconds */
export function ticksToSeconds(ticks?: number): number {
  if (!ticks || ticks <= 0) return 0;
  return ticks / 10_000_000;
}

export function secondsToTicks(seconds: number): number {
  return Math.floor(Math.max(0, seconds) * 10_000_000);
}

export function formatTicksDuration(ticks?: number): string {
  const sec = Math.max(0, Math.floor(ticksToSeconds(ticks)));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function albumArtistLine(item: EmbyItem): string {
  if (item.AlbumArtist) return item.AlbumArtist;
  if (item.Artists?.length) return item.Artists.join(', ');
  return '';
}

export function isAudioItem(item: EmbyItem): boolean {
  return item.Type === 'Audio' || item.MediaType === 'Audio';
}

export function isAlbumItem(item: EmbyItem): boolean {
  const ty = item.Type || '';
  return ty === 'MusicAlbum' || ty === 'Album';
}
