/** Client helpers for the Emby proxy at /api/emby/* — never talk to Emby directly. */
import type { Settings } from '../types';

const PROXY = '/api/emby';

export type EmbyUserData = {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
};

export type EmbyItem = {
  Id: string;
  Name: string;
  Type?: string;
  SeriesName?: string;
  ProductionYear?: number;
  UserData?: EmbyUserData;
  ImageTags?: { Primary?: string };
  PrimaryImageItemId?: string;
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

async function proxyGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
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
  return res.json() as Promise<T>;
}

export async function embyViews(userId: string): Promise<EmbyView[]> {
  const data = await proxyGet<EmbyViewsResponse>(`Users/${encodeURIComponent(userId)}/Views`);
  return data.Items || [];
}

export async function embyResume(userId: string, limit = 8): Promise<EmbyItem[]> {
  const data = await proxyGet<EmbyItemsResponse>(`Users/${encodeURIComponent(userId)}/Items/Resume`, {
    MediaTypes: 'Video',
    Limit: limit,
    Fields: 'UserData,PrimaryImageAspectRatio,SeriesName,ProductionYear',
  });
  return data.Items || [];
}

export async function embyLatest(userId: string, limit = 8): Promise<EmbyItem[]> {
  // Latest uses a slightly different shape on some servers; Items array is common
  const data = await proxyGet<EmbyItemsResponse | EmbyItem[]>(
    `Users/${encodeURIComponent(userId)}/Items/Latest`,
    { Limit: limit, Fields: 'UserData,PrimaryImageAspectRatio' },
  );
  if (Array.isArray(data)) return data;
  return data.Items || [];
}

export async function embyPublicInfo(): Promise<EmbyPublicInfo> {
  return proxyGet<EmbyPublicInfo>('System/Info/Public');
}

/** Image URL via same-origin proxy (api_key never leaves the edge). */
export function embyImageUrl(itemId: string, maxWidth = 200, imageType = 'Primary'): string {
  const q = new URLSearchParams({ maxWidth: String(maxWidth) });
  return `${PROXY}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(imageType)}?${q}`;
}

export function playedPercent(item: EmbyItem): number {
  const ud = item.UserData;
  if (!ud) return 0;
  if (typeof ud.PlayedPercentage === 'number') return Math.min(100, Math.max(0, ud.PlayedPercentage));
  // ticks fallback not reliable without runtime — prefer percentage
  return 0;
}

export function displayTitle(item: EmbyItem): string {
  if (item.SeriesName && item.Name && item.Type === 'Episode') {
    return `${item.SeriesName} · ${item.Name}`;
  }
  return item.Name || 'Untitled';
}

/**
 * Deep link into Emby web UI. webUrl is the public browser URL (not a secret).
 * serverId from System/Info/Public.
 */
export function embyWebItemLink(webUrl: string, serverId: string, itemId: string): string {
  const base = webUrl.replace(/\/+$/, '');
  // Prefer modern hash route; /web/index.html still works on many installs
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
 * Try native app scheme, then always fall back to web. Native may no-op in
 * browser tabs / some PWAs — web link is the guaranteed path.
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
    const start = Date.now();
    // Attempt app open; if still visible shortly after, use web
    window.location.href = app;
    window.setTimeout(() => {
      // If page still here after ~700ms, open web in same tab
      if (Date.now() - start < 2000) {
        window.location.href = web;
      }
    }, 700);
    return;
  }
  window.open(web, '_blank', 'noopener,noreferrer');
}

/** Resolve public Emby web URL from settings (supports legacy embyUrl). */
export function resolveEmbyWebUrl(settings: Settings): string {
  return (settings.emby?.webUrl || settings.embyUrl || '').replace(/\/+$/, '');
}
