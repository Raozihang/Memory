import { useRef, useState, useEffect, memo, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface LazyImageProps {
  src: string;
  /** 高清图 URL，如果提供且加载成功则替换 src */
  highQualitySrc?: string;
  alt: string;
  className?: string;
  onLoad?: (img: HTMLImageElement) => void;
  /** 高清图加载失败时的回调 */
  onHighQualityError?: () => void;
  onClick?: () => void;
}

/**
 * 懒加载图片组件
 * - 只有进入视口时才开始加载
 * - 加载完成后永久保持显示，不会因滚动出视口而卸载
 * - 支持高清图升级：先显示缩略图，高清图加载成功后平滑切换（无闪烁）
 */
export const LazyImage = memo(function LazyImage({ 
  src, 
  highQualitySrc,
  alt, 
  className, 
  onLoad,
  onHighQualityError,
  onClick 
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 高清图状态：null=未尝试, 'loading'=加载中, 'loaded'=成功, 'failed'=失败
  const [highQualityState, setHighQualityState] = useState<'loading' | 'loaded' | 'failed' | null>(null);
  // 高清图预加载完成的 URL
  const [preloadedHighQualitySrc, setPreloadedHighQualitySrc] = useState<string | null>(null);

  useEffect(() => {
    // 如果已经加载过，不再观察
    if (shouldLoad) return;

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '1000px', // 提前 1000px 开始加载
        threshold: 0,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad]);

  // 当 highQualitySrc 变化时（从无到有），后台预加载高清图
  useEffect(() => {
    if (!highQualitySrc || !loaded || highQualityState === 'loaded') return;
    
    // 如果已经预加载过这个 URL，跳过
    if (preloadedHighQualitySrc === highQualitySrc) return;
    
    setHighQualityState('loading');
    const img = new Image();
    img.src = highQualitySrc;
    
    img.onload = () => {
      // 高清图完全加载后才切换，避免闪烁
      setPreloadedHighQualitySrc(highQualitySrc);
      setHighQualityState('loaded');
    };
    img.onerror = () => {
      setHighQualityState('failed');
      onHighQualityError?.();
    };
    
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [highQualitySrc, loaded, highQualityState, onHighQualityError, preloadedHighQualitySrc]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    onLoad?.(e.currentTarget);
  }, [onLoad]);

  // 决定显示哪个图片源：只有预加载完成后才使用高清图
  const displaySrc = preloadedHighQualitySrc || src;

  return (
    <div 
      ref={containerRef} 
      className={cn("relative w-full h-full overflow-hidden", className)}
      onClick={onClick}
    >
      {shouldLoad && (
        <img
          key={displaySrc} // 使用 key 确保图片切换时不会闪烁
          src={displaySrc}
          alt={alt}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={handleLoad}
          decoding="async"
        />
      )}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted" />
      )}
    </div>
  );
});
