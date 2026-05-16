import { useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PhotoViewer } from '@/components/PhotoViewer';
import { MasonryPhotoGrid } from '@/components/MasonryPhotoGrid';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Download, Loader } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { InternalLink } from '@/components/InternalLink';

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewerIndex, setViewerIndex] = useState<number>(-1);
  const [columnWidth, setColumnWidth] = useState(280);
  const [exporting, setExporting] = useState(false);
  const requestedPhotoId = searchParams.get('photo') || searchParams.get('photoId');

  // Responsive column width for masonry
  useEffect(() => {
    const updateWidth = () => {
      const w = window.innerWidth;
      if (w < 640) setColumnWidth(150); // Mobile: 2 columns
      else if (w < 1024) setColumnWidth(200); // Tablet: 3 columns
      else setColumnWidth(260); // Desktop: 4+ columns
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const pageSize = 80;
  const {
    data: photosPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['photos', { scope: 'album', albumId: id }],
    queryFn: ({ pageParam }) => api.getPhotosPage({ albumId: id || undefined, limit: pageSize, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.nextOffset ?? undefined),
    enabled: !!id
  });

  const photos = useMemo(() => {
    return photosPages?.pages.flatMap(p => p.items) || [];
  }, [photosPages]);

  const { data: albums = [] } = useQuery({ 
    queryKey: ['albumsWithCovers'], 
    queryFn: api.getAlbumsWithCovers 
  });

  const album = albums.find(a => a.id === id);

  const jsonLd = album ? {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    "name": album.title,
    "description": album.description,
    "url": window.location.href,
    "image": photos.slice(0, 3).map(p => api.getPhotoUrl(p, 'medium'))
  } : undefined;

  const startDownload = (url: string, filename?: string) => {
    const link = document.createElement('a');
    link.href = url;
    if (filename) link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleBatchDownload = async () => {
    if (!id || exporting) return;
    setExporting(true);
    try {
      const result = await api.exportAlbum(id);
      startDownload(result.url, result.filename);
    } catch (error) {
      console.error(error);
      alert('批量下载准备失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!requestedPhotoId) return;

    const photoIndex = photos.findIndex(photo => photo.id === requestedPhotoId);
    if (photoIndex >= 0) {
      if (viewerIndex !== photoIndex) setViewerIndex(photoIndex);
      return;
    }

    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [requestedPhotoId, photos, viewerIndex, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const updatePhotoParam = useCallback((photoId: string, replace = true) => {
    const next = new URLSearchParams(searchParams);
    const currentPhotoId = next.get('photo') || next.get('photoId');
    if (currentPhotoId === photoId && next.has('photo') && !next.has('photoId')) return;

    next.set('photo', photoId);
    next.delete('photoId');
    setSearchParams(next, { replace });
  }, [searchParams, setSearchParams]);

  const handlePhotoClick = useCallback((photoIndex: number) => {
    setViewerIndex(photoIndex);
    const clickedPhoto = photos[photoIndex];
    if (clickedPhoto) updatePhotoParam(clickedPhoto.id, false);
  }, [photos, updatePhotoParam]);

  const handleViewerIndexChange = useCallback((photoIndex: number, photo: { id: string }) => {
    setViewerIndex(photoIndex);
    updatePhotoParam(photo.id, true);
  }, [updatePhotoParam]);

  const handleViewerClose = useCallback(() => {
    setViewerIndex(-1);
    const next = new URLSearchParams(searchParams);
    next.delete('photo');
    next.delete('photoId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!album && albums.length > 0) return <div>Album not found</div>;

  return (
    <div className="min-h-screen">
      <SEO 
        title={album?.title} 
        description={album?.description || `查看 ${album?.title || '相册'} 中的照片`}
        image="/logo.png"
        jsonLd={jsonLd}
      />
      <div className="mb-8 flex items-center gap-4">
        <InternalLink
          to="/"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 hover:bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </InternalLink>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-bold">{album?.title || 'Loading...'}</h1>
          <p className="truncate text-muted-foreground">{album?.description}</p>
        </div>
        <button
          onClick={handleBatchDownload}
          disabled={exporting || photos.length === 0}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-secondary/70 px-4 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? <Loader className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden sm:inline">{exporting ? '正在打包' : '批量下载'}</span>
        </button>
      </div>

      <MasonryPhotoGrid 
        photos={photos} 
        columnWidth={columnWidth}
        onClickPhoto={handlePhotoClick}
      />

      {hasNextPage && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-full bg-secondary/50 px-6 py-3 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            {isFetchingNextPage ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}

      {viewerIndex >= 0 && (
        <PhotoViewer
          photos={photos}
          initialIndex={viewerIndex}
          onClose={handleViewerClose}
          onIndexChange={handleViewerIndexChange}
          onLoadMore={() => fetchNextPage()}
          hasMore={hasNextPage}
          loadingMore={isFetchingNextPage}
        />
      )}
    </div>
  );
}
