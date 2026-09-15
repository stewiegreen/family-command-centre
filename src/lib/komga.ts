/** Client helpers for the Komga proxy at /api/komga/* — never talk to Komga directly. */
import type { Settings } from '../types';

const PROXY = '/api/komga';

export type KomgaReadProgress = {
  page?: number;
  completed?: boolean;
  readDate?: string;
};

export type KomgaBook = {
  id: string;
  name?: string;
  number?: number | string;
  seriesTitle?: string;
  seriesId?: string;
  readProgress?: KomgaReadProgress;
  media?: { pagesCount?: number; mediaType?: string };
};

export type KomgaLibrary = {
  id: string;
  name: string;
};

export type KomgaPageInfo = {
  number: number;
  mediaType?: string;
  width?: number;
  height?: number;
  fileName?: string;
};

type PageResult<T> = {
  content?: T[];
  totalElements?: number;
};

function memberQuery(memberId?: string | null): string {
  if (!memberId) return '';
  return `memberId=${encodeURIComponent(memberId)}`;
}

async function proxyGet<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const full = new URL(
    `${PROXY}/${path.replace(/^\//, '')}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://local',
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') full.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(full.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Komga proxy ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return undefined as T;
}

async function proxyPatch(path: string, body: unknown, memberId?: string | null): Promise<void> {
  const full = new URL(
    `${PROXY}/${path.replace(/^\//, '')}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://local',
  );
  if (memberId) full.searchParams.set('memberId', memberId);
  const res = await fetch(full.toString(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Komga proxy ${res.status}`);
  }
}

export async function komgaInProgress(size = 12, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books', {
    read_status: 'IN_PROGRESS',
    size,
    sort: 'readProgress.readDate,desc',
    memberId,
  });
  return data?.content || [];
}

export async function komgaOnDeck(size = 12, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books/ondeck', { size, memberId });
  return data?.content || [];
}

export async function komgaLibraries(memberId?: string): Promise<KomgaLibrary[]> {
  const data = await proxyGet<KomgaLibrary[] | PageResult<KomgaLibrary>>('v1/libraries', {
    memberId,
  });
  if (Array.isArray(data)) return data;
  return data?.content || [];
}

export function komgaBookThumbUrl(bookId: string, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/books/${encodeURIComponent(bookId)}/thumbnail${q ? `?${q}` : ''}`;
}

export function resolveKomgaWebUrl(settings: Settings): string {
  return (settings.komga?.webUrl || settings.komgaUrl || '').replace(/\/+$/, '');
}

/** External Komga web UI (escape hatch) — not used by the in-app reader. */
export function komgaBookWebLink(webUrl: string, bookId: string, openReader = true): string {
  const base = webUrl.replace(/\/+$/, '');
  if (openReader) return `${base}/book/${encodeURIComponent(bookId)}/read`;
  return `${base}/book/${encodeURIComponent(bookId)}`;
}

export function komgaLibraryWebLink(webUrl: string, libraryId: string): string {
  const base = webUrl.replace(/\/+$/, '');
  return `${base}/libraries/${encodeURIComponent(libraryId)}`;
}

export function bookTitle(b: KomgaBook): string {
  if (b.seriesTitle && b.name) return `${b.seriesTitle} · ${b.name}`;
  return b.name || b.seriesTitle || 'Untitled';
}

export function bookProgressPercent(b: KomgaBook): number {
  const page = b.readProgress?.page;
  const total = b.media?.pagesCount;
  if (b.readProgress?.completed) return 100;
  if (typeof page === 'number' && typeof total === 'number' && total > 0) {
    return Math.min(100, Math.max(0, (page / total) * 100));
  }
  return 0;
}

/** Page list for the in-app reader. */
export async function komgaBookPages(
  bookId: string,
  memberId?: string,
): Promise<KomgaPageInfo[]> {
  const data = await proxyGet<KomgaPageInfo[] | PageResult<KomgaPageInfo>>(
    `v1/books/${encodeURIComponent(bookId)}/pages`,
    { memberId },
  );
  if (Array.isArray(data)) return data;
  return data?.content || [];
}

/**
 * Proxy URL for a page image — use as <img src>.
 * Proxy forces Accept: image/jpeg upstream (Komga rejects image/*).
 */
export function komgaPageImageUrl(
  bookId: string,
  pageNumber: number,
  memberId?: string,
): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/books/${encodeURIComponent(bookId)}/pages/${pageNumber}${
    q ? `?${q}` : ''
  }`;
}

export async function komgaSiblingBook(
  bookId: string,
  dir: 'next' | 'previous',
  memberId?: string,
): Promise<KomgaBook | null> {
  try {
    const data = await proxyGet<KomgaBook>(`v1/books/${encodeURIComponent(bookId)}/${dir}`, {
      memberId,
    });
    return data?.id ? data : null;
  } catch {
    return null;
  }
}

export async function komgaMarkProgress(
  bookId: string,
  page: number,
  completed: boolean,
  memberId?: string,
): Promise<void> {
  await proxyPatch(
    `v1/books/${encodeURIComponent(bookId)}/read-progress`,
    { page, completed },
    memberId,
  );
}
