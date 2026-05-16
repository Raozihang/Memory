import { Album, Photo } from '@/lib/types';
import { api } from '@/lib/api';
import { useState, useCallback } from 'react';
import { InternalLink } from '@/components/InternalLink';

interface AlbumCardProps {
  album: Album;
  coverPhoto?: Photo;
}

export function AlbumCard({ album, coverPhoto }: AlbumCardProps) {
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0: thumb, 1: medium, 2: display, 3: original

  const getCoverUrl = useCallback(() => {
    if (!coverPhoto) return '';
    switch (fallbackLevel) {
      case 0: return api.getPhotoUrl(coverPhoto, 'thumb');
      case 1: return api.getPhotoUrl(coverPhoto, 'medium');
      case 2: return api.getPhotoUrl(coverPhoto, 'display');
      default: return api.getPhotoUrl(coverPhoto, 'original');
    }
  }, [coverPhoto, fallbackLevel]);

  const handleError = useCallback(() => {
    if (fallbackLevel < 3) {
      setFallbackLevel(prev => prev + 1);
    }
  }, [fallbackLevel]);

  const coverSrcSet = coverPhoto && fallbackLevel === 0
    ? [
      `${api.getPhotoUrl(coverPhoto, 'thumb')} 320w`,
      `${api.getPhotoUrl(coverPhoto, 'medium')} 800w`,
      `${api.getPhotoUrl(coverPhoto, 'display')} 1280w`,
    ].join(', ')
    : undefined;

  return (
    <InternalLink 
      to={`/album/${album.id}`}
      className="group relative block overflow-hidden rounded-2xl bg-card transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        {coverPhoto ? (
          <img 
            src={getCoverUrl()} 
            srcSet={coverSrcSet}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            alt={album.title}
            className="h-full w-full object-cover transition-transform duration-500 md:group-hover:scale-110"
            loading="lazy"
            decoding="async"
            onError={handleError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            No Cover
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-90" />
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
        <h3 className="text-lg font-bold leading-tight">{album.title}</h3>
        <p className="mt-1 text-xs text-white/70 line-clamp-2">{album.description || '无描述'}</p>
      </div>
    </InternalLink>
  );
}
