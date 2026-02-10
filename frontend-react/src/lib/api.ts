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

export const api = {
  getPhotos: async (): Promise<Photo[]> => {
    const res = await fetch('/api/photos');
    const data = await res.json();
    return data.items || [];
  },
  getPhotosPage: async (params: { albumId?: string; limit?: number; offset?: number; startTakenAt?: string; endTakenAt?: string }): Promise<PhotosPage> => {
    const qs = new URLSearchParams();
    if (params.albumId) qs.set('albumId', params.albumId);
    if (params.startTakenAt) qs.set('startTakenAt', params.startTakenAt);
    if (params.endTakenAt) qs.set('endTakenAt', params.endTakenAt);
    qs.set('limit', String(params.limit ?? 60));
    qs.set('offset', String(params.offset ?? 0));
    const res = await fetch(`/api/photos?${qs.toString()}`);
    return res.json();
  },
  getAlbums: async (): Promise<Album[]> => {
    const res = await fetch('/api/albums');
    const data = await res.json();
    return data.items || [];
  },
  getAlbumsWithCovers: async (): Promise<AlbumWithCover[]> => {
    const res = await fetch('/api/albums?includeCover=1');
    const data = await res.json();
    return data.items || [];
  },
  getTimeline: async (): Promise<TimelineResponse> => {
    const res = await fetch('/api/timeline');
    return res.json();
  },
  getExif: async (id: string): Promise<ExifData> => {
    const res = await fetch(`/api/photos/${id}/exif`);
    return res.json();
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
    const res = await fetch('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description })
    });
    return res.json();
  },
  uploadPhoto: async (body: any) => {
    const res = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  }
};
