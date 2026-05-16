import { Photo, Album, AlbumWithCover, TimelineResponse, ExifData, PhotosPage } from './types';

type ImageUrlMode = 'api' | 'direct';

function joinUrl(base: string, pathname: string) {
  const trimmedBase = String(base || '').replace(/\/+$/, '');
  const trimmedPath = String(pathname || '').replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
}

function normalizeCdnBase(base: string) {
  let b = String(base || '').trim();
  if (!b) return b;
  if (b.startsWith('//')) b = `https:${b}`;
  if (b.startsWith('http://')) b = `https://${b.slice('http://'.length)}`;
  if (!/^https?:\/\//i.test(b)) b = `https://${b}`;
  return b;
}

function encodeStorageKeyForPath(key: string) {
  return String(key || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/');
}

const IMAGE_CDN_BASE = normalizeCdnBase((import.meta as any)?.env?.VITE_IMAGE_CDN_BASE || 'https://img.cdjxfls.com');
const RAW_IMAGE_URL_MODE = String((import.meta as any)?.env?.VITE_IMAGE_URL_MODE || '').trim().toLowerCase();
const IMAGE_URL_MODE: ImageUrlMode = RAW_IMAGE_URL_MODE === 'api' ? 'api' : 'direct';
const FALLBACK_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Request failed with status ${res.status}`;
    const error = new Error(message) as Error & { status?: number; data?: unknown };
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  getPhotos: async (): Promise<Photo[]> => {
    const data = await fetchJson('/api/photos');
    return data.items || [];
  },
  getPhotosPage: async (params: { albumId?: string; limit?: number; offset?: number; startTakenAt?: string; endTakenAt?: string }): Promise<PhotosPage> => {
    const qs = new URLSearchParams();
    if (params.albumId) qs.set('albumId', params.albumId);
    if (params.startTakenAt) qs.set('startTakenAt', params.startTakenAt);
    if (params.endTakenAt) qs.set('endTakenAt', params.endTakenAt);
    qs.set('limit', String(params.limit ?? 60));
    qs.set('offset', String(params.offset ?? 0));
    return fetchJson(`/api/photos?${qs.toString()}`);
  },
  getAlbums: async (): Promise<Album[]> => {
    const data = await fetchJson('/api/albums');
    return data.items || [];
  },
  getAlbumsWithCovers: async (): Promise<AlbumWithCover[]> => {
    const data = await fetchJson('/api/albums?includeCover=1');
    return data.items || [];
  },
  getTimeline: async (): Promise<TimelineResponse> => {
    return fetchJson('/api/timeline');
  },
  getExif: async (id: string): Promise<ExifData> => {
    return fetchJson(`/api/photos/${id}/exif`);
  },
  getPhotoDownloadUrl: async (id: string): Promise<{ url: string; filename?: string }> => {
    return fetchJson(`/api/photos/${encodeURIComponent(id)}/downloadUrl`);
  },
  getAlbumDownloadUrls: async (id: string): Promise<{ files: Array<{ id: string; url: string; filename?: string }> }> => {
    return fetchJson(`/api/albums/${encodeURIComponent(id)}/downloadUrls`);
  },
  exportAlbum: async (id: string): Promise<{ url: string; filename?: string }> => {
    return fetchJson(`/api/albums/${encodeURIComponent(id)}/export`);
  },
  getImageUrl: (key: string) => {
    const encoded = encodeStorageKeyForPath(key);
    if (IMAGE_URL_MODE === 'direct') return joinUrl(IMAGE_CDN_BASE || FALLBACK_ORIGIN, encoded);
    return joinUrl(IMAGE_CDN_BASE || FALLBACK_ORIGIN, `api/files/${encoded}`);
  },
  getPhotoUrl: (photo: Photo, size: 'thumb' | 'medium' | 'display' | 'original' = 'display') => {
    let key = photo.storage_key;
    if (size === 'thumb' && photo.thumb_key) key = photo.thumb_key;
    if (size === 'medium' && photo.medium_key) key = photo.medium_key;
    if (size === 'display' && photo.display_key) key = photo.display_key;
    const encoded = encodeStorageKeyForPath(key);
    if (IMAGE_URL_MODE === 'direct') return joinUrl(IMAGE_CDN_BASE || FALLBACK_ORIGIN, encoded);
    return joinUrl(IMAGE_CDN_BASE || FALLBACK_ORIGIN, `api/files/${encoded}`);
  },
  createAlbum: async (title: string, description: string) => {
    return fetchJson('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description })
    });
  },
  uploadPhoto: async (body: any) => {
    return fetchJson('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },
  getUploadSession: async (): Promise<{ authenticated: boolean; expiresAt?: string }> => {
    return fetchJson('/api/upload-auth/session');
  },
  loginUpload: async (password: string): Promise<{ authenticated: boolean }> => {
    return fetchJson('/api/upload-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
  },
  logoutUpload: async (): Promise<{ authenticated: boolean }> => {
    return fetchJson('/api/upload-auth/logout', {
      method: 'POST'
    });
  },
};
