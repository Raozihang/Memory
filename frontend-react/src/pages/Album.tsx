import { useParams, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PhotoViewer } from '@/components/PhotoViewer';
import { MasonryPhotoGrid } from '@/components/MasonryPhotoGrid';
import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [viewerIndex, setViewerIndex] = useState<number>(-1);
  const [columnWidth, setColumnWidth] = useState(280);

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
    queryKey: ['albums'], 
    queryFn: api.getAlbums 
  });

  const album = albums.find(a => a.id === id);

  if (!album && albums.length > 0) return <div>Album not found</div>;

  return (
    <div className="min-h-screen">
      <div className="mb-8 flex items-center gap-4">
        <button 
          onClick={() => navigate('/')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 hover:bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">{album?.title || 'Loading...'}</h1>
          <p className="text-muted-foreground">{album?.description}</p>
        </div>
      </div>

      <MasonryPhotoGrid 
        photos={photos} 
        columnWidth={columnWidth}
        onClickPhoto={setViewerIndex}
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
          onClose={() => setViewerIndex(-1)}
        />
      )}
    </div>
  );
}
