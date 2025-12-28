import { Album, Photo } from '@/lib/types';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useState, useCallback } from 'react';

interface AlbumCardProps {
  album: Album;
  coverPhoto?: Photo;
}

export function AlbumCard({ album, coverPhoto }: AlbumCardProps) {
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0: display, 1: medium, 2: original

  const getCoverUrl = useCallback(() => {
    if (!coverPhoto) return '';
    switch (fallbackLevel) {
      case 0: return api.getPhotoUrl(coverPhoto, 'display');
      case 1: return api.getPhotoUrl(coverPhoto, 'medium');
      default: return api.getPhotoUrl(coverPhoto, 'original');
    }
  }, [coverPhoto, fallbackLevel]);

  const handleError = useCallback(() => {
    if (fallbackLevel < 2) {
      setFallbackLevel(prev => prev + 1);
    }
  }, [fallbackLevel]);

  return (
    <Link 
      to={`/album/${album.id}`}
      className="group relative block overflow-hidden rounded-2xl bg-card transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        {coverPhoto ? (
          <img 
            src={getCoverUrl()} 
            alt={album.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
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
    </Link>
  );
}
