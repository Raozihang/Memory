import { Photo } from '@/lib/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';

interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
  className?: string;
  variant?: 'masonry' | 'grid' | 'justified';
  aspectRatio?: number; // width / height, 用于 justified 布局
}

export function PhotoCard({ photo, onClick, className, variant = 'masonry', aspectRatio }: PhotoCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0: thumb, 1: medium, 2: display, 3: original
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const isGrid = variant === 'grid';
  const isJustified = variant === 'justified';

  const thumbUrl = api.getPhotoUrl(photo, 'thumb');
  const mediumUrl = api.getPhotoUrl(photo, 'medium');
  const displayUrl = api.getPhotoUrl(photo, 'display');
  const originalUrl = api.getPhotoUrl(photo, 'original');

  // 根据 fallback 级别选择图片源
  const getCurrentSrc = useCallback(() => {
    switch (fallbackLevel) {
      case 0: return displayUrl;
      case 1: return thumbUrl;
      case 2: return mediumUrl;
      default: return originalUrl;
    }
  }, [fallbackLevel, thumbUrl, mediumUrl, displayUrl, originalUrl]);

  const currentSrc = getCurrentSrc();
  
  // 只有在没有 fallback 时才使用 srcSet
  const srcSet = fallbackLevel === 0 && thumbUrl !== mediumUrl 
    ? `${thumbUrl} 320w, ${mediumUrl} 800w` 
    : undefined;
  const sizes = isJustified
    ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'
    : isGrid
      ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'
      : '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw';

  const handleError = useCallback(() => {
    // 尝试下一个 fallback 级别
    if (fallbackLevel < 3) {
      setFallbackLevel(prev => prev + 1);
    }
  }, [fallbackLevel]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalAspect(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  // 计算实际使用的宽高比
  const effectiveAspect = aspectRatio || naturalAspect;

  return (
    <div 
      className={cn(
        "group relative cursor-zoom-in overflow-hidden rounded-xl bg-muted",
        className
      )}
      onClick={onClick}
    >
      <img
        src={currentSrc}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={photo.filename}
        className={cn(
          "transition-all duration-300 hover:scale-105",
          isGrid ? "h-full w-full object-cover" : "",
          isJustified ? "h-full w-auto object-contain" : "",
          !isGrid && !isJustified ? "h-auto w-full" : "",
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={isJustified && effectiveAspect ? { 
          aspectRatio: effectiveAspect,
          maxWidth: '100%'
        } : undefined}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
    </div>
  );
}
