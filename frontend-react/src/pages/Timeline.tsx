import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Photo } from '@/lib/types';
import { PhotoViewer } from '@/components/PhotoViewer';
import { MasonryPhotoGrid } from '@/components/MasonryPhotoGrid';
import { DraggableDateTimeline } from '@/components/DraggableDateTimeline';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLayout } from '@/lib/LayoutContext';
import { cn } from '@/lib/utils';

type TimelineMode = 'day' | 'hour';

const pad2 = (n: number) => String(n).padStart(2, '0');
const normalizeToDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const normalizeToHour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
const formatDayKey = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
const formatHourKey = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:00`;

export default function Timeline() {
  const { data: photos = [], isLoading, isError } = useQuery({
    queryKey: ['photos', { scope: 'timeline', mode: 'all' }],
    queryFn: api.getPhotos
  });
  const [mode, setMode] = useState<TimelineMode>('hour');
  const [viewerIndex, setViewerIndex] = useState<number>(-1);
  const [viewerPhotos, setViewerPhotos] = useState<Photo[]>([]);
  const [columnWidth, setColumnWidth] = useState(200);
  
  // 滚动隐藏顶栏
  const { setImmersive, isImmersive } = useLayout();
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const threshold = 80;
        
        if (currentScrollY > lastScrollY.current && currentScrollY > threshold) {
          // 向下滚动且超过阈值，进入沉浸模式
          setImmersive(true);
        } else if (currentScrollY < lastScrollY.current - 10) {
          // 向上滚动超过 10px，退出沉浸模式
          setImmersive(false);
        }
        
        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
      ticking.current = true;
    }
  }, [setImmersive]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      // 离开页面时重置沉浸模式
      setImmersive(false);
    };
  }, [handleScroll, setImmersive]);

  // Responsive column width for masonry
  useEffect(() => {
    const updateWidth = () => {
      const w = window.innerWidth;
      if (w < 640) setColumnWidth(120); // Mobile: smaller columns
      else if (w < 1024) setColumnWidth(160);
      else setColumnWidth(200);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const groupedPhotos = useMemo(() => {
    const normalize = mode === 'day' ? normalizeToDay : normalizeToHour;
    const toKey = mode === 'day' ? formatDayKey : formatHourKey;
    const groups: { [key: string]: Photo[] } = {};
    
    photos.forEach(photo => {
      const date = new Date(photo.taken_at);
      const key = toKey(date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(photo);
    });

    // Sort descending
    return Object.entries(groups).sort((a, b) => {
      const dateA = normalize(new Date(a[1][0].taken_at)).getTime();
      const dateB = normalize(new Date(b[1][0].taken_at)).getTime();
      return dateB - dateA;
    });
  }, [photos, mode]);

  const availableDates = useMemo(() => {
    const normalize = mode === 'day' ? normalizeToDay : normalizeToHour;
    return groupedPhotos.map(([_, groupPhotos]) => {
      return normalize(new Date(groupPhotos[0].taken_at));
    });
  }, [groupedPhotos, mode]);

  const initialDate = useMemo(() => {
    const normalize = mode === 'day' ? normalizeToDay : normalizeToHour;
    if (groupedPhotos.length > 0) {
      return normalize(new Date(groupedPhotos[0][1][0].taken_at));
    }
    return new Date();
  }, [groupedPhotos, mode]);

  const handlePhotoClick = (groupPhotos: Photo[], index: number) => {
    setViewerPhotos(groupPhotos);
    setViewerIndex(index);
  };

  const handleDateSelect = (date: Date) => {
    const dateStr = (mode === 'day' ? formatDayKey : formatHourKey)(date);
    const element = document.getElementById(dateStr);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className={cn(
        "mb-8 sticky top-16 z-30 bg-background/95 backdrop-blur pb-4 pt-4 -mt-4 transition-all duration-300",
        isImmersive && "top-0"
      )}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">时间轴</h1>
            <p className="text-muted-foreground">按时间顺序查看您的照片回忆</p>
          </div>
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setMode('day')}
              className={[
                "px-4 py-1.5 text-sm font-medium rounded-full transition-colors",
                mode === 'day' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              ].join(' ')}
            >
              日
            </button>
            <button
              type="button"
              onClick={() => setMode('hour')}
              className={[
                "px-4 py-1.5 text-sm font-medium rounded-full transition-colors",
                mode === 'hour' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              ].join(' ')}
            >
              时
            </button>
          </div>
        </div>
        <DraggableDateTimeline 
          onDateSelect={handleDateSelect} 
          className="hidden md:flex"
          availableDates={availableDates}
          initialDate={initialDate}
          mode={mode}
        />
      </div>

      <div className="relative border-l border-white/10 ml-4 md:ml-8 pl-8 md:pl-12 py-4 space-y-12">
        {isError && (
          <div className="text-center py-20 text-muted-foreground">
            加载失败
          </div>
        )}

        {groupedPhotos.map(([groupKey, groupPhotos]) => (
          <div key={groupKey} id={groupKey} className={cn(
            "relative transition-all duration-300",
            isImmersive ? "scroll-mt-48" : "scroll-mt-64"
          )}>
            {/* Timeline dot */}
            <div className="absolute -left-[41px] md:-left-[57px] top-0 h-5 w-5 rounded-full border-4 border-background bg-primary" />
            
            <h2 className={cn(
              "mb-4 text-xl font-bold sticky z-20 inline-block rounded-lg bg-background/80 backdrop-blur px-3 py-1 transition-all duration-300",
              isImmersive ? "top-4" : "top-20"
            )}>
              {groupKey} 
              <span className="ml-3 text-sm font-normal text-muted-foreground">{groupPhotos.length} 张照片</span>
            </h2>

            <MasonryPhotoGrid 
              photos={groupPhotos} 
              columnWidth={columnWidth}
              onClickPhoto={(index: number) => handlePhotoClick(groupPhotos, index)}
            />
          </div>
        ))}

        {isLoading && (
          <div className="text-center py-20 text-muted-foreground">
            加载中...
          </div>
        )}

        {!isLoading && photos.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            暂无照片
          </div>
        )}
      </div>

      {viewerIndex >= 0 && (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(-1)}
        />
      )}
    </div>
  );
}
