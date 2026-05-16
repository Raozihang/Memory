
import { useEffect, useMemo, useState, useCallback, useRef, type CSSProperties } from 'react';
import { Photo } from '@/lib/types';
import { api } from '@/lib/api';
import { X, ChevronLeft, ChevronRight, Info, Download, Loader, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useLayout } from '@/lib/LayoutContext';
import { imageCache } from '@/lib/imageCache';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';

// 检测是否为微信环境
const isWeChat = () => {
  const ua = navigator.userAgent.toLowerCase();
  return /micromessenger/.test(ua);
};

// 鸿蒙/华为系浏览器需要原生长按菜单来保存图片。
const isHarmonyOSBrowser = () => {
  const ua = navigator.userAgent.toLowerCase();
  return /harmonyos|openharmony|arkweb|huaweibrowser|huawei|honor/.test(ua);
};

interface PhotoViewerProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onIndexChange?: (index: number, photo: Photo) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export function PhotoViewer({ photos, initialIndex, onClose, onIndexChange, onLoadMore, hasMore, loadingMore }: PhotoViewerProps) {
  const { setViewerOpen } = useLayout();
  const [index, setIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const photo = photos[index];

  const [viewOriginal, setViewOriginal] = useState(false);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showWeChatTip, setShowWeChatTip] = useState(false);
  const [showLastPhotoTip, setShowLastPhotoTip] = useState(false);
  const [showLoadingTip, setShowLoadingTip] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [originalDownloadUrl, setOriginalDownloadUrl] = useState('');
  const [originalDownloadFilename, setOriginalDownloadFilename] = useState('');
  
  // 渐进式加载状态：先显示缩略图，再切换到大图
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [displayLoaded, setDisplayLoaded] = useState(false);
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0: display, 1: medium, 2: original
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const transformComponentRef = useRef<ReactZoomPanPinchRef>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  
  // 缓存微信环境检测结果
  const isWeChatEnv = useMemo(() => isWeChat(), []);
  const isHarmonyOSEnv = useMemo(() => isHarmonyOSBrowser(), []);
  const allowNativeImageActions = isWeChatEnv || isHarmonyOSEnv;
  const isMobileViewport = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;
  }, []);

  const thumbUrl = useMemo(() => api.getPhotoUrl(photo, 'thumb'), [photo]);
  const mediumUrl = useMemo(() => api.getPhotoUrl(photo, 'medium'), [photo]);
  const displayUrl = useMemo(() => api.getPhotoUrl(photo, 'display'), [photo]);
  const originalUrl = useMemo(() => api.getPhotoUrl(photo, 'original'), [photo]);
  const nativeImageActionStyle = useMemo<CSSProperties | undefined>(() => {
    if (!allowNativeImageActions) return undefined;
    return {
      WebkitTouchCallout: 'default',
      WebkitUserSelect: 'auto',
      userSelect: 'auto',
      touchAction: 'auto',
    };
  }, [allowNativeImageActions]);
  
  // 根据 fallback 级别选择预览图：display -> medium -> original
  const previewUrl = useMemo(() => {
    switch (fallbackLevel) {
      case 0: return displayUrl;
      case 1: return mediumUrl;
      default: return originalUrl;
    }
  }, [fallbackLevel, displayUrl, mediumUrl, originalUrl]);
  
  const originalViewUrl = originalDownloadUrl || originalUrl;
  const shownSrc = viewOriginal ? originalViewUrl : previewUrl;
  const shouldForceOriginalPrompt = isWeChatEnv && isHarmonyOSEnv && (!viewOriginal || loadingOriginal);
  const saveTipText = shouldForceOriginalPrompt ? '请先查看原图，再长按保存' : '长按图片保存';
  
  // 判断是否显示加载中状态（缩略图和大图都没加载完）
  const isLoading = (!thumbLoaded && !displayLoaded) || loadingOriginal;

  // 模拟进度条逻辑
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loadingOriginal) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          // 如果已经很高了，增加的幅度变小
          if (prev >= 99) return prev;
          // 前期快，后期慢
          const increment = prev < 30 ? Math.random() * 15 : 
                           prev < 60 ? Math.random() * 5 : 
                           prev < 80 ? Math.random() * 2 : 
                           Math.random() * 0.5;
          return Math.min(99, Math.floor(prev + increment));
        });
      }, 200);
    } else {
      setProgress(100);
    }
    return () => clearInterval(interval);
  }, [loadingOriginal]);

  useEffect(() => {
    // 打开 viewer 时隐藏胶囊导航
    setViewerOpen(true);
    
    if (allowNativeImageActions) {
      document.body.classList.add('wechat-viewer-active');
    }

    return () => {
      setViewerOpen(false);
      document.body.classList.remove('wechat-viewer-active');
    };
  }, [allowNativeImageActions, setViewerOpen]);

  useEffect(() => {
    setViewOriginal(false);
    setLoadingOriginal(false);
    setLoadError(false);
    setFallbackLevel(0); // 重置为默认 display 级别
    setOriginalDownloadUrl('');
    setOriginalDownloadFilename('');
    
    // 检查是否已有缓存的高清图
    const cachedQuality = imageCache.getLoadedQuality(photo.id);
    if (cachedQuality === 'display' || cachedQuality === 'original') {
      // 已有高清缓存，跳过缩略图阶段
      setThumbLoaded(true);
      setDisplayLoaded(true);
    } else {
      setThumbLoaded(false);
      setDisplayLoaded(false);
      setImageDimensions(null);
    }
    
    // Reset zoom when changing photos
    if (transformComponentRef.current) {
      transformComponentRef.current.resetTransform();
    }
  }, [index, photo.id]);

  useEffect(() => {
    onIndexChange?.(index, photo);
  }, [index, photo, onIndexChange]);

  // 预览图加载失败时的降级处理：display -> medium -> original
  const handlePreviewError = useCallback(() => {
    if (fallbackLevel < 2) {
      setFallbackLevel(prev => prev + 1);
      setDisplayLoaded(false);
    }
  }, [fallbackLevel]);
  
  // 缩略图加载完成，获取尺寸
  const handleThumbLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setThumbLoaded(true);
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight && !imageDimensions) {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    }
  }, [imageDimensions]);
  
  // 大图加载完成
  const handleDisplayLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setDisplayLoaded(true);
    setLoadingOriginal(false);
    setProgress(100);
    const img = e.currentTarget;
    // 用大图的实际尺寸更新，确保尺寸准确
    if (img.naturalWidth && img.naturalHeight) {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    }
    // 标记该图片已加载高清版本，供瀑布流复用
    const quality = viewOriginal ? 'original' : fallbackLevel === 0 ? 'display' : fallbackLevel === 1 ? 'medium' : 'original';
    imageCache.markLoaded(photo.id, quality);
  }, [photo.id, fallbackLevel, viewOriginal]);

  const handleShownImageError = useCallback(() => {
    if (viewOriginal) {
      if (originalDownloadUrl) {
        setOriginalDownloadUrl('');
        setOriginalDownloadFilename('');
        return;
      }
      setViewOriginal(false);
      setLoadingOriginal(false);
      setLoadError(true);
      return;
    }
    handlePreviewError();
  }, [handlePreviewError, originalDownloadUrl, viewOriginal]);

  const handleViewOriginal = useCallback(async () => {
    setLoadingOriginal(true);
    setLoadError(false);
    try {
      if (!originalDownloadUrl) {
        const result = await api.getPhotoDownloadUrl(photo.id);
        setOriginalDownloadUrl(result.url);
        setOriginalDownloadFilename(result.filename || photo.filename);
      }
      setViewOriginal(true);
    } catch (error) {
      console.error(error);
      setLoadingOriginal(false);
      setLoadError(true);
    }
  }, [originalDownloadUrl, photo.id, photo.filename]);

  const startDownload = useCallback((url: string, filename?: string) => {
    const link = document.createElement('a');
    link.href = url;
    if (filename) link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const showLongPressSaveTip = useCallback(() => {
    setShowWeChatTip(true);
    setTimeout(() => setShowWeChatTip(false), 2000);
  }, []);

  const handleDownload = useCallback(async () => {
    if (shouldForceOriginalPrompt) {
      showLongPressSaveTip();
      return;
    }

    if (downloading) return;
    if (originalDownloadUrl) {
      startDownload(originalDownloadUrl, originalDownloadFilename || photo.filename);
      return;
    }

    setDownloading(true);
    try {
      const result = await api.getPhotoDownloadUrl(photo.id);
      setOriginalDownloadUrl(result.url);
      setOriginalDownloadFilename(result.filename || photo.filename);
      startDownload(result.url, result.filename || photo.filename);
    } catch (error) {
      console.error(error);
      showLongPressSaveTip();
    } finally {
      setDownloading(false);
    }
  }, [downloading, originalDownloadFilename, originalDownloadUrl, photo.id, photo.filename, shouldForceOriginalPrompt, showLongPressSaveTip, startDownload]);

  const handleNext = useCallback(() => {
    if (index < photos.length - 1) {
      setDirection(1);
      setIndex(i => i + 1);
    } else {
      if (hasMore) {
        if (!loadingMore) {
          onLoadMore?.();
        }
        setShowLoadingTip(true);
        setTimeout(() => setShowLoadingTip(false), 2000);
      } else {
        setShowLastPhotoTip(true);
        setTimeout(() => setShowLastPhotoTip(false), 2000);
      }
    }
  }, [photos.length, index, hasMore, loadingMore, onLoadMore]);

  const handlePrev = useCallback(() => {
    if (index > 0) {
      setDirection(-1);
      setIndex(i => i - 1);
    }
  }, [index]);

  // Auto load more when close to end
  useEffect(() => {
    if (hasMore && !loadingMore && photos.length - 1 - index <= 3) {
      onLoadMore?.();
    }
  }, [index, photos.length, hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleNext, handlePrev]);

  const { data: exif } = useQuery({
    queryKey: ['exif', photo.id],
    queryFn: () => api.getExif(photo.id),
    enabled: showInfo
  });

  useEffect(() => {
    // Preload next/prev images
    if (index < photos.length - 1) {
      const next = photos[index + 1];
      new Image().src = api.getPhotoUrl(next, 'thumb');
      imageCache.priorityPreload(next.id, api.getPhotoUrl(next, 'display'));
    }
    if (index > 0) {
      const prev = photos[index - 1];
      new Image().src = api.getPhotoUrl(prev, 'thumb');
      imageCache.priorityPreload(prev.id, api.getPhotoUrl(prev, 'display'));
    }
  }, [index, photos]);

  const isMultiTouchRef = useRef(false);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // 如果检测到多指操作（如缩放），则忽略拖拽翻页
    if (isMultiTouchRef.current) {
      isMultiTouchRef.current = false;
      return;
    }

    const SWIPE_THRESHOLD = 50;
    const { offset } = info;

    if (offset.x < -SWIPE_THRESHOLD) {
      handleNext();
    } else if (offset.x > SWIPE_THRESHOLD) {
      handlePrev();
    }
  };

  const imageContent = (
    <div
      className="relative flex items-center justify-center w-full h-full"
      style={nativeImageActionStyle}
    >
      {/* 缩略图作为占位 - 先显示，大图加载完成后切换 */}
      {!displayLoaded && !viewOriginal && (
        <img
          src={thumbUrl}
          alt=""
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-200",
            thumbLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={handleThumbLoad}
          decoding="async"
        />
      )}

      {/* 大图 - 加载完成后显示 */}
      <img
        src={shownSrc}
        alt={photo.filename}
        className={cn(
          "w-full h-full object-contain shadow-2xl transition-opacity duration-300",
          displayLoaded || viewOriginal ? "opacity-100" : "opacity-0",
          // 需要原生图片菜单的环境允许长按操作，其他环境保持预览手势。
          !allowNativeImageActions && "select-none"
        )}
        onLoad={handleDisplayLoad}
        onError={handleShownImageError}
        // 微信/鸿蒙等环境不阻止右键/长按菜单，允许分享和保存。
        onContextMenu={allowNativeImageActions ? undefined : (e) => e.preventDefault()}
        style={nativeImageActionStyle}
        decoding="async"
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader className="h-6 w-6 animate-spin text-white/70" />
        </div>
      )}

      {shouldForceOriginalPrompt && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 px-6 text-center">
          <div className="max-w-xs">
            <div className="text-base font-medium text-white">请先查看原图</div>
            <div className="mt-2 text-sm leading-6 text-white/75">
              加载原图后再长按保存，才能下载到清晰版本。
            </div>
            <button
              onClick={handleViewOriginal}
              disabled={loadingOriginal}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-black disabled:opacity-70"
            >
              {loadingOriginal ? `加载中 ${progress}%` : loadError ? '重新加载原图' : '查看原图'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/95", !isMobileViewport && "backdrop-blur-sm")}>
      <div className="absolute right-4 top-4 z-[80] flex gap-2">
        <button 
          onClick={() => setShowInfo(!showInfo)}
          className={cn("rounded-full bg-white/10 p-2 text-white hover:bg-white/20", showInfo && "bg-white/30")}
        >
          <Info className="h-6 w-6" />
        </button>
        {isWeChatEnv ? (
          <button
            onClick={showLongPressSaveTip}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <Download className="h-6 w-6" />
          </button>
        ) : (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            {downloading ? <Loader className="h-6 w-6 animate-spin" /> : <Download className="h-6 w-6" />}
          </button>
        )}
        <button 
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <button 
        onClick={handlePrev}
        className="absolute left-0 top-16 bottom-0 z-40 w-16 flex items-center justify-start pl-2 text-white/60 hover:text-white hover:bg-gradient-to-r hover:from-black/30 hover:to-transparent transition-all group"
        aria-label="上一张"
      >
        <ChevronLeft className="h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      <button 
        onClick={handleNext}
        className="absolute right-0 top-16 bottom-0 z-40 w-16 flex items-center justify-end pr-2 text-white/60 hover:text-white hover:bg-gradient-to-l hover:from-black/30 hover:to-transparent transition-all group"
        aria-label="下一张"
      >
        <ChevronRight className="h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      <div className="flex h-full w-full items-center justify-center p-4">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            variants={{
              enter: (direction: number) => ({
                x: direction > 0 ? 1000 : -1000,
                opacity: 0
              }),
              center: {
                zIndex: 1,
                x: 0,
                opacity: 1
              },
              exit: (direction: number) => ({
                zIndex: 0,
                x: direction < 0 ? 1000 : -1000,
                opacity: 0
              })
            }}
            initial="enter"
             animate="center"
             exit="exit"
             transition={isMobileViewport ? {
               x: { duration: 0.18, ease: "easeOut" },
               opacity: { duration: 0.12 }
             } : {
               x: { type: "spring", stiffness: 300, damping: 30 },
               opacity: { duration: 0.2 }
             }}
             drag={!isZoomed && !allowNativeImageActions ? "x" : false}
             dragConstraints={{ left: 0, right: 0 }}
             dragElastic={isMobileViewport ? 0.08 : 0.2}
             onDragEnd={handleDragEnd}
             onTouchStart={(e) => {
               if (e.touches.length > 1) {
                 isMultiTouchRef.current = true;
               } else {
                 isMultiTouchRef.current = false;
               }
             }}
             className={cn(
               "absolute inset-0 flex items-center justify-center p-4",
               allowNativeImageActions ? "touch-auto" : "touch-none"
             )}
           >
             {allowNativeImageActions ? (
               imageContent
             ) : (
               <TransformWrapper
                ref={transformComponentRef}
                initialScale={1}
                minScale={0.5}
                maxScale={8}
                centerOnInit={true}
                onTransformed={(e) => setIsZoomed(e.state.scale > 1.01)}
                doubleClick={{
                  disabled: false,
                  mode: "reset",
                  step: 3 // Double click to zoom in 3x
                }}
                panning={{ disabled: !isZoomed || allowNativeImageActions }}
              >
                <TransformComponent
                  wrapperClass="!w-full !h-full"
                contentClass="!w-full !h-full flex items-center justify-center"
              >
                {imageContent}
              </TransformComponent>
            </TransformWrapper>
             )}
          </motion.div>
        </AnimatePresence>
      </div>

      {(!viewOriginal || loadingOriginal) && !isZoomed && !shouldForceOriginalPrompt && (
        <div className="absolute bottom-12 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!loadingOriginal) handleViewOriginal();
            }}
            disabled={loadingOriginal}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-800/80 px-6 py-2 text-sm font-medium text-white backdrop-blur-md active:scale-95 transition-all active:bg-zinc-700 shadow-lg border border-white/10"
          >
            {loadingOriginal ? (
              <>
                <Loader className="h-4 w-4 animate-spin text-white/80" />
                <span className="text-white/90">加载中 {progress}%</span>
              </>
            ) : loadError ? (
              <span className="text-red-400">加载失败，点击重试</span>
            ) : (
              <span>查看原图</span>
            )}
          </button>
        </div>
      )}

      {isZoomed && (
        <div className="absolute bottom-12 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              transformComponentRef.current?.resetTransform();
              setIsZoomed(false);
            }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-800/80 px-6 py-2 text-sm font-medium text-white backdrop-blur-md active:scale-95 transition-all active:bg-zinc-700 shadow-lg border border-white/10"
          >
            <ZoomOut className="h-4 w-4 text-white/90" />
            <span>恢复大小</span>
          </button>
        </div>
      )}

      {showInfo && (
        <div className="absolute right-4 top-20 z-[70] max-h-[calc(100vh-7rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl bg-black/70 p-6 text-white backdrop-blur-2xl border border-white/10 shadow-2xl transition-all duration-300">
          <h3 className="mb-4 text-xl font-bold tracking-tight">Details</h3>
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-white/50">Filename</div>
              <div className="truncate">{photo.filename}</div>
            </div>
            <div>
              <div className="text-white/50">Taken At</div>
              <div>{new Date(photo.taken_at).toLocaleString()}</div>
            </div>
            {exif?.exif_json && (
              <>
                {exif.exif_json.Make && (
                  <div>
                    <div className="text-white/50">Camera</div>
                    <div>{exif.exif_json.Make} {exif.exif_json.Model}</div>
                  </div>
                )}
                {exif.exif_json.FocalLength && (
                  <div>
                    <div className="text-white/50">Focal Length</div>
                    <div>{exif.exif_json.FocalLength}mm</div>
                  </div>
                )}
                {exif.exif_json.FNumber && (
                  <div>
                    <div className="text-white/50">Aperture</div>
                    <div>f/{exif.exif_json.FNumber}</div>
                  </div>
                )}
                {exif.exif_json.ISO && (
                  <div>
                    <div className="text-white/50">ISO</div>
                    <div>{exif.exif_json.ISO}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 微信环境下载提示 Toast */}
      {showWeChatTip && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] animate-fade-in-out">
          <div className="rounded-xl bg-zinc-800/95 px-5 py-3 text-sm text-white shadow-lg border border-white/10 whitespace-nowrap">
            {saveTipText}
          </div>
        </div>
      )}

      {/* 加载更多提示 Toast */}
      {showLoadingTip && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] animate-fade-in-out">
          <div className="rounded-xl bg-zinc-800/95 px-5 py-3 text-sm text-white shadow-lg border border-white/10 whitespace-nowrap flex items-center gap-2">
            <Loader className="h-4 w-4 animate-spin" />
            正在加载更多...
          </div>
        </div>
      )}

      {/* 最后一张提示 Toast */}
      {showLastPhotoTip && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] animate-fade-in-out">
          <div className="rounded-xl bg-zinc-800/95 px-5 py-3 text-sm text-white shadow-lg border border-white/10 whitespace-nowrap">
            已经是最后一张了
          </div>
        </div>
      )}
    </div>
  );
}
