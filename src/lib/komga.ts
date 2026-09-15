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
  libraryId?: string;
  readProgress?: KomgaReadProgress;
  media?: { pagesCount?: number; mediaType?: string };
  metadata?: {
    title?: string;
    summary?: string;
    authors?: { name: string; role: string }[];
    tags?: string[];
    releaseDate?: string;
  };
};

export type KomgaLibrary = { id: string; name: string };

export type KomgaSeries = {
  id: string;
  name?: string;
  sortTitle?: string;
  libraryId?: string;
  booksCount?: number;
  unreadCount?: number;
  metadata?: { title?: string; summary?: string; genres?: string[]; tags?: string[] };
};

export type KomgaCollection = {
  id: string;
  name: string;
  seriesIds: string[];
  ordered?: boolean;
};

export type KomgaReadlist = {
  id: string;
  name: string;
  summary?: string;
  bookIds?: string[];
};

export type KomgaPageInfo = {
  number: number;
  mediaType?: string;
  width?: number;
  height?: number;
  fileName?: string;
};

type PageResult<T> = { content?: T[]; totalElements?: number };

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

async function proxyWrite(
  path: string,
  method: 'PATCH' | 'DELETE',
  body?: unknown,
  memberId?: string | null,
): Promise<void> {
  const full = new URL(
    `${PROXY}/${path.replace(/^\//, '')}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://local',
  );
  if (memberId) full.searchParams.set('memberId', memberId);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(full.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Komga proxy ${res.status}`);
  }
}

export async function komgaInProgress(size = 12, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books', {
    read_status: 'IN_PROGRESS', size, sort: 'readProgress.readDate,desc', memberId,
  });
  return data?.content || [];
}

export async function komgaOnDeck(size = 12, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books/ondeck', { size, memberId });
  return data?.content || [];
}

export async function komgaLatestBooks(size = 12, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books/latest', {
    size, sort: 'created,desc', memberId,
  });
  return data?.content || [];
}

export async function komgaSearchBooks(search: string, size = 24, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books', { search, size, memberId });
  return data?.content || [];
}

export async function komgaLibraries(memberId?: string): Promise<KomgaLibrary[]> {
  const data = await proxyGet<KomgaLibrary[] | PageResult<KomgaLibrary>>('v1/libraries', { memberId });
  if (Array.isArray(data)) return data;
  return data?.content || [];
}

export async function komgaSeries(size = 100, memberId?: string): Promise<KomgaSeries[]> {
  const data = await proxyGet<PageResult<KomgaSeries>>('v1/series', { size, memberId });
  return data?.content || [];
}

export async function komgaSeriesBooks(seriesId: string, size = 100, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books', {
    series_id: seriesId, size, sort: 'metadata.numberSort,asc', memberId,
  });
  return data?.content || [];
}

export async function komgaCollections(size = 100, memberId?: string): Promise<KomgaCollection[]> {
  const data = await proxyGet<PageResult<KomgaCollection>>('v1/collections', { size, memberId });
  return data?.content || [];
}

export async function komgaCollectionSeries(collectionId: string, size = 100, memberId?: string): Promise<KomgaSeries[]> {
  const data = await proxyGet<PageResult<KomgaSeries>>(
    `v1/collections/${encodeURIComponent(collectionId)}/series`,
    { size, memberId },
  );
  return data?.content || [];
}

export async function komgaReadlists(size = 100, memberId?: string): Promise<KomgaReadlist[]> {
  const data = await proxyGet<PageResult<KomgaReadlist>>('v1/readlists', { size, memberId });
  return data?.content || [];
}

export async function komgaReadlistBooks(readlistId: string, size = 100, memberId?: string): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook>>(
    `v1/readlists/${encodeURIComponent(readlistId)}/books`,
    { size, memberId },
  );
  return data?.content || [];
}

export async function komgaMarkRead(bookId: string, pagesCount = 1, memberId?: string): Promise<void> {
  await proxyWrite(
    `v1/books/${encodeURIComponent(bookId)}/read-progress`,
    'PATCH',
    { page: Math.max(1, pagesCount), completed: true },
    memberId,
  );
}

export async function komgaMarkUnread(bookId: string, memberId?: string): Promise<void> {
  await proxyWrite(`v1/books/${encodeURIComponent(bookId)}/read-progress`, 'DELETE', undefined, memberId);
}

export function komgaBookThumbUrl(bookId: string, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/books/${encodeURIComponent(bookId)}/thumbnail${q ? `?${q}` : ''}`;
}

export function komgaSeriesThumbUrl(seriesId: string, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/series/${encodeURIComponent(seriesId)}/thumbnail${q ? `?${q}` : ''}`;
}

export function resolveKomgaWebUrl(settings: Settings): string {
  return (settings.komga?.webUrl || settings.komgaUrl || '').replace(/\/+$/, '');
}

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
  return b.name || b.metadata?.title || b.seriesTitle || 'Untitled';
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

export async function komgaBookPages(bookId: string, memberId?: string): Promise<KomgaPageInfo[]> {
  const data = await proxyGet<KomgaPageInfo[] | PageResult<KomgaPageInfo>>(
    `v1/books/${encodeURIComponent(bookId)}/pages`, { memberId },
  );
  if (Array.isArray(data)) return data;
  return data?.content || [];
}

export function komgaPageImageUrl(bookId: string, pageNumber: number, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/books/${encodeURIComponent(bookId)}/pages/${pageNumber}${q ? `?${q}` : ''}`;
}

export async function komgaSiblingBook(bookId: string, dir: 'next' | 'previous', memberId?: string): Promise<KomgaBook | null> {
  try {
    const data = await proxyGet<KomgaBook>(`v1/books/${encodeURIComponent(bookId)}/${dir}`, { memberId });
    return data?.id ? data : null;
  } catch {
    return null;
  }
}

export async function komgaMarkProgress(bookId: string, page: number, completed: boolean, memberId?: string): Promise<void> {
  await proxyWrite(
    `v1/books/${encodeURIComponent(bookId)}/read-progress`,
    'PATCH',
    { page, completed },
    memberId,
  );
}
