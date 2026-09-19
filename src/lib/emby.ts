/** Client helpers for the Emby proxy at /api/emby/* — never talk to Emby directly. */
import type { Settings } from '../types';

const PROXY = '/api/emby';

const DETAIL_FIELDS =
  'Overview,UserData,PrimaryImageAspectRatio,SeriesName,ProductionYear,ChildCount,RecursiveItemCount,RunTimeTicks,OfficialRating,Genres,CommunityRating,ParentId,SeasonName,IndexNumber,ParentIndexNumber';

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
  ImageTags?: { Primary?: string; Backdrop?: string };
  PrimaryImageItemId?: string;
  CollectionType?: string;
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

export async function embyLatest(userId: string, limit = 16): Promise<EmbyItem[]> {
  const data = await proxyGet<EmbyItemsResponse | EmbyItem[]>(
    `Users/${encodeURIComponent(userId)}/Items/Latest`,
    { Limit: limit, Fields: DETAIL_FIELDS },
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

export async function embyChildren(
  userId: string,
  parentId: string,
  opts: { limit?: number; startIndex?: number; includeItemTypes?: string } = {},
): Promise<{ items: EmbyItem[]; total: number }> {
  return embyItems(userId, {
    parentId,
    recursive: false,
    sortBy: 'SortName',
    limit: opts.limit ?? 60,
    startIndex: opts.startIndex ?? 0,
    includeItemTypes: opts.includeItemTypes,
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

/** Image URL via same-origin proxy (api_key never leaves the edge). */
export function embyImageUrl(itemId: string, maxWidth = 320, imageType = 'Primary'): string {
  const q = new URLSearchParams({ maxWidth: String(maxWidth) });
  return `${PROXY}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(imageType)}?${q}`;
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
}): string {
  const q = new URLSearchParams();
  q.set('UserId', opts.userId);
  q.set('DeviceId', embyDeviceId());
  q.set('Static', 'true');
  if (opts.mediaSourceId) q.set('MediaSourceId', opts.mediaSourceId);
  if (opts.playSessionId) q.set('PlaySessionId', opts.playSessionId);
  if (opts.startTicks && opts.startTicks > 0) q.set('StartTimeTicks', String(Math.floor(opts.startTicks)));
  if (opts.maxBitrate) q.set('MaxStreamingBitrate', String(opts.maxBitrate));
  // Encourage browser-playable output when Static direct fails server-side Emby may still remux
  q.set('Container', 'mp4');
  return `${PROXY}/Videos/${encodeURIComponent(opts.itemId)}/stream?${q.toString()}`;
}

/** HLS master — Safari (and some others) can play natively. */
export function embyHlsUrl(opts: {
  itemId: string;
  userId: string;
  mediaSourceId?: string;
  playSessionId?: string;
}): string {
  const q = new URLSearchParams();
  q.set('UserId', opts.userId);
  q.set('DeviceId', embyDeviceId());
  if (opts.mediaSourceId) q.set('MediaSourceId', opts.mediaSourceId);
  if (opts.playSessionId) q.set('PlaySessionId', opts.playSessionId);
  return `${PROXY}/Videos/${encodeURIComponent(opts.itemId)}/master.m3u8?${q.toString()}`;
}

/** Transcode-friendly progressive stream when direct Static fails. */
export function embyTranscodeStreamUrl(opts: {
  itemId: string;
  userId: string;
  mediaSourceId?: string;
  playSessionId?: string;
  startTicks?: number;
}): string {
  const q = new URLSearchParams();
  q.set('UserId', opts.userId);
  q.set('DeviceId', embyDeviceId());
  q.set('VideoCodec', 'h264');
  q.set('AudioCodec', 'aac');
  q.set('MaxStreamingBitrate', '8000000');
  q.set('Container', 'mp4');
  if (opts.mediaSourceId) q.set('MediaSourceId', opts.mediaSourceId);
  if (opts.playSessionId) q.set('PlaySessionId', opts.playSessionId);
  if (opts.startTicks && opts.startTicks > 0) q.set('StartTimeTicks', String(Math.floor(opts.startTicks)));
  return `${PROXY}/Videos/${encodeURIComponent(opts.itemId)}/stream?${q.toString()}`;
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
