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
  number?: number;
  numberSort?: number;
  seriesId?: string;
  seriesTitle?: string;
  libraryId?: string;
  readProgress?: KomgaReadProgress;
  media?: { pagesCount?: number };
  metadata?: { title?: string; number?: string };
};

export type KomgaLibrary = {
  id: string;
  name: string;
};

export type KomgaPage<T> = {
  content?: T[];
  totalElements?: number;
  size?: number;
  number?: number;
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
    throw new Error(`Komga proxy ${res.status}: ${text || res.statusText}`);
  }
  // thumbnail endpoints return binary — callers use URL directly
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json') || ct.includes('text/json')) {
    return res.json() as Promise<T>;
  }
  return undefined as T;
}

/** Books currently in progress (continue reading). */
export async function komgaInProgress(size = 12): Promise<KomgaBook[]> {
  const data = await proxyGet<KomgaPage<KomgaBook>>('v1/books', {
    read_status: 'IN_PROGRESS',
    size,
    sort: 'readProgress.readDate,desc',
  });
  return data?.content || [];
}

/** Next unread books in series you've started (on deck). */
export async function komgaOnDeck(size = 12): Promise<KomgaBook[]> {
  const data = await proxyGet<KomgaPage<KomgaBook> | KomgaBook[]>('v1/books/ondeck', { size });
  if (Array.isArray(data)) return data;
  return data?.content || [];
}

export async function komgaLibraries(): Promise<KomgaLibrary[]> {
  const data = await proxyGet<KomgaLibrary[] | KomgaPage<KomgaLibrary>>('v1/libraries');
  if (Array.isArray(data)) return data;
  return data?.content || [];
}

export function komgaBookThumbUrl(bookId: string): string {
  return `${PROXY}/v1/books/${encodeURIComponent(bookId)}/thumbnail`;
}

export function resolveKomgaWebUrl(settings: Settings): string {
  return (settings.komga?.webUrl || settings.komgaUrl || '').replace(/\/+$/, '');
}

/** Komga web UI uses singular /book/:id (not /books/). /read opens the reader. */
export function komgaBookWebLink(webUrl: string, bookId: string, openReader = true): string {
  const base = webUrl.replace(/\/+$/, '');
  const path = openReader
    ? `/book/${encodeURIComponent(bookId)}/read`
    : `/book/${encodeURIComponent(bookId)}`;
  return `${base}${path}`;
}

/** Library home in the web UI is /libraries/:id/series (or recommended). */
export function komgaLibraryWebLink(webUrl: string, libraryId: string): string {
  const base = webUrl.replace(/\/+$/, '');
  return `${base}/libraries/${encodeURIComponent(libraryId)}/series`;
}

export function bookTitle(b: KomgaBook): string {
  const title = b.metadata?.title || b.name || 'Untitled';
  if (b.seriesTitle) return `${b.seriesTitle} · ${title}`;
  return title;
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
