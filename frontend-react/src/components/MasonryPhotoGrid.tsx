import { Photo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import { LazyImage } from './LazyImage';
import { imageCache } from '@/lib/imageCache';

interface MasonryPhotoGridProps {
  photos: Photo[];
  onClickPhoto: (index: number) => void;
  className?: string;
  columnWidth?: number;
  gap?: number;
}

// 全局缓存：存储已加载图片的宽高比，避免重复加载时闪烁
const globalAspectCache = new Map<string, number>();

export function MasonryPhotoGrid({ 
  photos, 
  onClickPhoto,
  className,
  columnWidth = 160,
  gap = 8
}: MasonryPhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  // 存储已加载图片的宽高比（用于显示）
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>(() => {
    // 初始化时从全局缓存恢复
    const cached: Record<string, number> = {};
    photos.forEach(p => {
      const ratio = globalAspectCache.get(p.id);
      if (ratio) cached[p.id] = ratio;
    });
    return cached;
  });
  const [loadedImages, setLoadedImages] = useState<Set<string>>(() => {
    // 初始化时标记已缓存的图片为已加载
    return new Set(photos.filter(p => globalAspectCache.has(p.id)).map(p => p.id));
  });
  // 追踪哪些图片应该使用高清版本（从 PhotoViewer 缓存中获取）
  const [highQualityIds, setHighQualityIds] = useState<Set<string>>(() => new Set(imageCache.getHighQualityIds()));
  // 追踪高清图加载失败的图片，回退到 thumb
  const [failedHighQuality, setFailedHighQuality] = useState<Set<string>>(new Set());
  
  // 记录初始布局分配，防止后续重排
  const initialAssignmentRef = useRef<Map<string, number>>(new Map());

  // 订阅 imageCache 更新，当有新的高清图加载完成时更新状态
  useEffect(() => {
    const unsubscribe = imageCache.subscribe((photoId) => {
      setHighQualityIds(prev => {
        if (prev.has(photoId)) return prev;
        const next = new Set(prev);
        next.add(photoId);
        return next;
      });
    });
    return unsubscribe;
  }, []);

  // 响应式计算列数
  useEffect(() => {
    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth;
      // 移动端小屏幕（<400px）使用单列，否则根据宽度计算
      let cols: number;
      if (width < 400) {
        cols = 1;
      } else if (width < 600) {
        cols = 2;
      } else {
        cols = Math.max(2, Math.floor((width + gap) / (columnWidth + gap)));
      }
      setColumns(cols);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [columnWidth, gap]);

  // 图片加载完成后更新宽高比（批量更新减少重排）
  const pendingUpdates = useRef<Record<string, number>>({});
  const updateTimer = useRef<number | null>(null);

  const flushAspectUpdates = useCallback(() => {
    const updates = pendingUpdates.current;
    if (Object.keys(updates).length === 0) return;
    
    // 同时更新全局缓存
    Object.entries(updates).forEach(([id, ratio]) => {
      globalAspectCache.set(id, ratio);
    });
    
    setAspectRatios(prev => ({ ...prev, ...updates }));
    setLoadedImages(prev => {
      const next = new Set(prev);
      Object.keys(updates).forEach(id => next.add(id));
      return next;
    });
    pendingUpdates.current = {};
  }, []);

  const handleImageLoad = useCallback((photo: Photo, img: HTMLImageElement) => {
    if (img.naturalWidth && img.naturalHeight) {
      const aspect = img.naturalWidth / img.naturalHeight;
      pendingUpdates.current[photo.id] = aspect;
      
      // 批量更新：50ms 内的更新合并处理
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = window.setTimeout(flushAspectUpdates, 50);
      
      // 缩略图加载完成后，将 display 图加入后台预加载队列
      const displayUrl = api.getPhotoUrl(photo, 'display');
      imageCache.queuePreload(photo.id, displayUrl);
    }
  }, [flushAspectUpdates]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, []);

  // 当 photos 或 columns 变化时，重置初始分配
  useEffect(() => {
    initialAssignmentRef.current.clear();
  }, [photos, columns]);

  // 将照片分配到各列（贪心算法）
  // 关键：一旦分配后不再改变，避免闪烁
  const columnPhotos = useMemo(() => {
    const cols: { photo: Photo; index: number }[][] = Array.from({ length: columns }, () => []);
    const heights: number[] = Array(columns).fill(0);
    const assignment = initialAssignmentRef.current;

    photos.forEach((photo, index) => {
      let colIndex: number;
      
      // 如果已有分配记录，使用之前的分配
      if (assignment.has(photo.id)) {
        colIndex = assignment.get(photo.id)!;
        // 确保列索引有效（列数可能变化）
        if (colIndex >= columns) {
          colIndex = colIndex % columns;
        }
      } else {
        // 新图片：分配到最短列
        const minHeight = Math.min(...heights);
        colIndex = heights.indexOf(minHeight);
        assignment.set(photo.id, colIndex);
      }
      
      cols[colIndex].push({ photo, index });
      
      // 使用缓存的宽高比或默认值 0.75（更接近常见照片比例）
      const aspect = globalAspectCache.get(photo.id) || aspectRatios[photo.id] || 0.75;
      heights[colIndex] += (1 / aspect) + gap / columnWidth;
    });

    return cols;
  }, [photos, columns, gap, columnWidth, aspectRatios]);

  return (
    <div 
      ref={containerRef}
      className={cn("flex w-full", className)}
      style={{ gap }}
    >
      {columnPhotos.map((colPhotos, colIndex) => (
        <div 
          key={colIndex} 
          className="flex flex-1 flex-col"
          style={{ gap }}
        >
          {colPhotos.map(({ photo, index }) => {
            // 显示时使用真实宽高比（如果已加载）
            const aspect = aspectRatios[photo.id];
            const isLoaded = loadedImages.has(photo.id);
            // 检查是否有缓存的高清图可用，且未失败过
            const hasHighQuality = highQualityIds.has(photo.id) && !failedHighQuality.has(photo.id);
            const highQualitySrc = hasHighQuality ? api.getPhotoUrl(photo, 'display') : undefined;
            
            return (
              <div 
                key={photo.id}
                className={cn(
                  "relative w-full overflow-hidden rounded-xl bg-muted cursor-zoom-in group",
                  !isLoaded && "min-h-[200px]"
                )}
                style={aspect ? { aspectRatio: aspect } : { aspectRatio: 1 }}
                onClick={() => onClickPhoto(index)}
              >
                <LazyImage
                  src={api.getPhotoUrl(photo, 'thumb')}
                  highQualitySrc={highQualitySrc}
                  alt={photo.filename}
                  className="hover:scale-105 transition-transform duration-500"
                  onLoad={(img) => handleImageLoad(photo, img)}
                  onHighQualityError={() => {
                    // 高清图加载失败，标记为失败，回退到 thumb
                    setFailedHighQuality(prev => {
                      const next = new Set(prev);
                      next.add(photo.id);
                      return next;
                    });
                  }}
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 pointer-events-none" />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
