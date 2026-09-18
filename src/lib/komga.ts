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
  series?: { id?: string; name?: string };
  metadata?: {
    title?: string;
    summary?: string;
    authors?: Array<{ name?: string; role?: string }>;
    tags?: string[];
    releaseDate?: string;
    genres?: string[];
  };
  readProgress?: KomgaReadProgress;
  media?: { pagesCount?: number; mediaType?: string };
};

export type KomgaSeries = {
  id: string;
  name?: string;
  url?: string;
  metadata?: {
    title?: string;
    sortTitle?: string;
    summary?: string;
    status?: string;
    genres?: string[];
    tags?: string[];
    publisher?: string;
    language?: string;
    ageRating?: string;
  };
  booksCount?: number;
  booksUnreadCount?: number;
  booksInProgressCount?: number;
};

export type KomgaLibrary = { id: string; name: string };

export type KomgaCollection = {
  id: string;
  name: string;
  ordered?: boolean;
  seriesIds?: string[];
};

export type KomgaReadList = {
  id: string;
  name: string;
  bookIds?: string[];
  ordered?: boolean;
};

export type KomgaPageInfo = {
  number: number;
  mediaType?: string;
  width?: number;
  height?: number;
  fileName?: string;
};

type PageResult<T> = { content?: T[]; totalElements?: number; totalPages?: number };

/** Komga search_regex: "regex,FIELD" for TITLE or TITLE_SORT — server-side letter buckets. */
export function letterSearchRegex(letter: string): string {
  const L = letter.trim().toUpperCase();
  if (L === '#') {
    // Titles that do not start with A–Z / a–z
    return '^[^A-Za-z].*,TITLE_SORT';
  }
  if (/^[A-Z]$/.test(L)) {
    const lower = L.toLowerCase();
    return `^[${L}${lower}].*,TITLE_SORT`;
  }
  return '';
}

function memberQuery(memberId?: string | null): string {
  if (!memberId) return '';
  return `memberId=${encodeURIComponent(memberId)}`;
}

async function proxyGet<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const full = new URL(`${PROXY}/${path.replace(/^\//, '')}`, window.location.origin);
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

async function proxyMutation(
  path: string,
  method: 'PATCH' | 'DELETE',
  body?: unknown,
  memberId?: string | null,
): Promise<void> {
  const full = new URL(`${PROXY}/${path.replace(/^\//, '')}`, window.location.origin);
  if (memberId) full.searchParams.set('memberId', memberId);
  const res = await fetch(full.toString(), {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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
  const data = await proxyGet<PageResult<KomgaBook>>('v1/books/latest', { size, memberId });
  return data?.content || [];
}

export async function komgaBooks(
  opts: {
    size?: number;
    page?: number;
    search?: string;
    libraryId?: string;
    readStatus?: string;
    sort?: string;
    memberId?: string;
  } = {},
): Promise<PageResult<KomgaBook>> {
  return proxyGet<PageResult<KomgaBook>>('v1/books', {
    size: opts.size ?? 24,
    page: opts.page ?? 0,
    search: opts.search,
    library_id: opts.libraryId,
    read_status: opts.readStatus,
    sort: opts.sort ?? 'metadata.title,asc',
    memberId: opts.memberId,
  });
}

export async function komgaBook(bookId: string, memberId?: string): Promise<KomgaBook> {
  return proxyGet<KomgaBook>(`v1/books/${encodeURIComponent(bookId)}`, { memberId });
}

export async function komgaSeries(
  opts: {
    size?: number;
    page?: number;
    search?: string;
    /** Komga "regex,TITLE_SORT" — e.g. letterSearchRegex('Z'). */
    searchRegex?: string;
    libraryId?: string;
    memberId?: string;
    /** Default alphabetical by title. */
    sort?: string;
  } = {},
): Promise<PageResult<KomgaSeries>> {
  return proxyGet<PageResult<KomgaSeries>>('v1/series', {
    size: opts.size ?? 24,
    page: opts.page ?? 0,
    search: opts.search,
    search_regex: opts.searchRegex || undefined,
    library_id: opts.libraryId,
    sort: opts.sort ?? 'metadata.titleSort,asc',
    memberId: opts.memberId,
  });
}

export async function komgaSeriesDetail(seriesId: string, memberId?: string): Promise<KomgaSeries> {
  return proxyGet<KomgaSeries>(`v1/series/${encodeURIComponent(seriesId)}`, { memberId });
}

/** One page of books in reading order (numberSort). */
export async function komgaSeriesBooksPage(
  seriesId: string,
  opts: { memberId?: string; size?: number; page?: number } = {},
): Promise<PageResult<KomgaBook>> {
  const data = await proxyGet<PageResult<KomgaBook> | KomgaBook[]>(
    `v1/series/${encodeURIComponent(seriesId)}/books`,
    {
      memberId: opts.memberId,
      size: opts.size ?? 40,
      page: opts.page ?? 0,
      sort: 'metadata.numberSort,asc',
    },
  );
  if (Array.isArray(data)) {
    return { content: data, totalElements: data.length, totalPages: 1 };
  }
  return data || { content: [], totalElements: 0, totalPages: 0 };
}

/** @deprecated prefer komgaSeriesBooksPage for infinite scroll */
export async function komgaSeriesBooks(seriesId: string, memberId?: string): Promise<KomgaBook[]> {
  const page = await komgaSeriesBooksPage(seriesId, { memberId, size: 100, page: 0 });
  return page.content || [];
}

export async function komgaLibraries(memberId?: string): Promise<KomgaLibrary[]> {
  const data = await proxyGet<KomgaLibrary[] | PageResult<KomgaLibrary>>('v1/libraries', { memberId });
  return Array.isArray(data) ? data : data?.content || [];
}

export function komgaBookThumbUrl(bookId: string, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/books/${encodeURIComponent(bookId)}/thumbnail${q ? `?${q}` : ''}`;
}

export function komgaSeriesThumbUrl(seriesId: string, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/series/${encodeURIComponent(seriesId)}/thumbnail${q ? `?${q}` : ''}`;
}


export async function komgaSeriesNew(size = 24, memberId?: string): Promise<KomgaSeries[]> {
  const data = await proxyGet<PageResult<KomgaSeries> | KomgaSeries[]>('v1/series/new', {
    size,
    memberId,
  });
  return Array.isArray(data) ? data : data?.content || [];
}

/** Recently finished / fully read books (Komga read_status=READ). */
export async function komgaRecentlyRead(size = 12, memberId?: string): Promise<KomgaBook[]> {
  const data = await komgaBooks({
    size,
    memberId,
    readStatus: 'READ',
    sort: 'readProgress.readDate,desc',
  });
  return data?.content || [];
}

export async function komgaCollections(memberId?: string): Promise<KomgaCollection[]> {
  const data = await proxyGet<KomgaCollection[] | PageResult<KomgaCollection>>('v1/collections', {
    memberId,
    size: 50,
  });
  return Array.isArray(data) ? data : data?.content || [];
}

export async function komgaCollectionSeries(
  collectionId: string,
  memberId?: string,
): Promise<KomgaSeries[]> {
  const data = await proxyGet<PageResult<KomgaSeries> | KomgaSeries[]>(
    `v1/collections/${encodeURIComponent(collectionId)}/series`,
    { memberId, size: 100 },
  );
  return Array.isArray(data) ? data : data?.content || [];
}

export function komgaCollectionThumbUrl(collectionId: string, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/collections/${encodeURIComponent(collectionId)}/thumbnail${q ? `?${q}` : ''}`;
}

export async function komgaReadlists(memberId?: string): Promise<KomgaReadList[]> {
  const data = await proxyGet<KomgaReadList[] | PageResult<KomgaReadList>>('v1/readlists', {
    memberId,
    size: 50,
  });
  return Array.isArray(data) ? data : data?.content || [];
}

export async function komgaReadlistBooks(
  readlistId: string,
  memberId?: string,
): Promise<KomgaBook[]> {
  const data = await proxyGet<PageResult<KomgaBook> | KomgaBook[]>(
    `v1/readlists/${encodeURIComponent(readlistId)}/books`,
    { memberId, size: 100 },
  );
  return Array.isArray(data) ? data : data?.content || [];
}

export function komgaReadlistThumbUrl(readlistId: string, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/readlists/${encodeURIComponent(readlistId)}/thumbnail${q ? `?${q}` : ''}`;
}

export function resolveKomgaWebUrl(settings: Settings): string {
  return (settings.komga?.webUrl || settings.komgaUrl || '').replace(/\/+$/, '');
}

export function komgaBookWebLink(webUrl: string, bookId: string, openReader = true): string {
  const base = webUrl.replace(/\/+$/, '');
  return openReader ? `${base}/book/${encodeURIComponent(bookId)}/read` : `${base}/book/${encodeURIComponent(bookId)}`;
}

export function komgaLibraryWebLink(webUrl: string, libraryId: string): string {
  return `${webUrl.replace(/\/+$/, '')}/libraries/${encodeURIComponent(libraryId)}`;
}

export function bookTitle(b: KomgaBook): string {
  if (b.seriesTitle && b.name) return `${b.seriesTitle} · ${b.name}`;
  return b.name || b.metadata?.title || b.seriesTitle || 'Untitled';
}

export function seriesTitle(s: KomgaSeries): string {
  return s.name || s.metadata?.title || 'Untitled series';
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

export async function komgaMarkProgress(bookId: string, page: number, completed: boolean, memberId?: string): Promise<void> {
  await proxyMutation(`v1/books/${encodeURIComponent(bookId)}/read-progress`, 'PATCH', { page, completed }, memberId);
}

export async function komgaMarkRead(book: KomgaBook, memberId?: string): Promise<void> {
  await komgaMarkProgress(book.id, book.media?.pagesCount || 1, true, memberId);
}

export async function komgaMarkUnread(bookId: string, memberId?: string): Promise<void> {
  await proxyMutation(`v1/books/${encodeURIComponent(bookId)}/read-progress`, 'DELETE', undefined, memberId);
}

export async function komgaBookPages(bookId: string, memberId?: string): Promise<KomgaPageInfo[]> {
  const data = await proxyGet<KomgaPageInfo[] | PageResult<KomgaPageInfo>>(
    `v1/books/${encodeURIComponent(bookId)}/pages`, { memberId },
  );
  return Array.isArray(data) ? data : data?.content || [];
}

export function komgaPageImageUrl(bookId: string, pageNumber: number, memberId?: string): string {
  const q = memberQuery(memberId);
  return `${PROXY}/v1/books/${encodeURIComponent(bookId)}/pages/${pageNumber}${q ? `?${q}` : ''}`;
}

export async function komgaSiblingBook(bookId: string, dir: 'next' | 'previous', memberId?: string): Promise<KomgaBook | null> {
  try {
    const data = await proxyGet<KomgaBook>(`v1/books/${encodeURIComponent(bookId)}/${dir}`, { memberId });
    return data?.id ? data : null;
  } catch { return null; }
}
