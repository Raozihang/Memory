import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Photo } from '@/lib/types';
import { PhotoViewer } from '@/components/PhotoViewer';
import { MasonryPhotoGrid } from '@/components/MasonryPhotoGrid';
import { DraggableDateTimeline } from '@/components/DraggableDateTimeline';
import { GridDensityToggle } from '@/components/GridDensityToggle';
import { useResponsivePhotoColumns, useStoredGridDensity } from '@/lib/gridDensity';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLayout } from '@/lib/LayoutContext';
import { cn } from '@/lib/utils';
import { SEO } from '@/components/SEO';

type TimelineMode = 'day' | 'hour';

const pad2 = (n: number) => String(n).padStart(2, '0');
const normalizeToDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const normalizeToHour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
const formatDayKey = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
const formatHourKey = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:00`;

const parseTimelineBucket = (bucket: string) => {
  const [datePart, timePart = '00:00:00'] = bucket.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour] = timePart.split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, 0, 0, 0);
};

const getDateRange = (date: Date, mode: TimelineMode) => {
  const start = mode === 'day' ? normalizeToDay(date) : normalizeToHour(date);
  const end = new Date(start);
  if (mode === 'day') {
    end.setDate(end.getDate() + 1);
  } else {
    end.setHours(end.getHours() + 1);
  }
  return {
    startTakenAt: start.toISOString(),
    endTakenAt: end.toISOString(),
  };
};

export default function Timeline() {
  const { data: timelineSummary, isLoading: isTimelineLoading, isError: isTimelineError } = useQuery({
    queryKey: ['timeline-summary'],
    queryFn: api.getTimeline
  });

  const pageSize = useMemo(() => {
    if (typeof window === 'undefined') return 160;
    return window.innerWidth < 640 ? 80 : 160;
  }, []);
  const [mode, setMode] = useState<TimelineMode>('hour');
  const [viewerIndex, setViewerIndex] = useState<number>(-1);
  const [viewerPhotos, setViewerPhotos] = useState<Photo[]>([]);
  const [gridDensity, setGridDensity] = useStoredGridDensity('less');
  const gridColumns = useResponsivePhotoColumns(gridDensity);

  const timelineBuckets = useMemo(() => {
    if (!timelineSummary) return [];
    return mode === 'day' ? timelineSummary.days : timelineSummary.hours;
  }, [mode, timelineSummary]);

  const availableDates = useMemo(() => {
    return timelineBuckets.map(item => parseTimelineBucket(item.bucket));
  }, [timelineBuckets]);

  const initialDate = useMemo(() => {
    return availableDates[0] || new Date();
  }, [availableDates]);

  const [activeDate, setActiveDate] = useState<Date>(() => initialDate);

  const selectedDate = useMemo(() => {
    if (availableDates.length === 0) return null;
    const normalize = mode === 'day' ? normalizeToDay : normalizeToHour;
    const normalizedActive = normalize(activeDate);
    return availableDates.find(date => date.getTime() === normalizedActive.getTime()) || initialDate;
  }, [activeDate, availableDates, initialDate, mode]);

  const dateRange = useMemo(() => {
    if (!selectedDate) return null;
    return getDateRange(selectedDate, mode);
  }, [mode, selectedDate]);

  const {
    data: photosPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError
  } = useInfiniteQuery({
    queryKey: ['photos', { scope: 'timeline', mode, pageSize, startTakenAt: dateRange?.startTakenAt, endTakenAt: dateRange?.endTakenAt }],
    queryFn: ({ pageParam }) => api.getPhotosPage({
      limit: pageSize,
      offset: pageParam as number,
      startTakenAt: dateRange?.startTakenAt,
      endTakenAt: dateRange?.endTakenAt,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.nextOffset ?? undefined),
    enabled: Boolean(dateRange)
  });
  const photos = useMemo(() => photosPages?.pages.flatMap(page => page.items) || [], [photosPages]);
  
  // 滚动隐藏顶栏
  const { setImmersive, isImmersive, setTimelineCapsule } = useLayout();
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

  useEffect(() => {
    if (availableDates.length === 0) return;
    const normalize = mode === 'day' ? normalizeToDay : normalizeToHour;
    setActiveDate((prev) => {
      const normalizedPrev = normalize(prev);
      const exact = availableDates.find(d => d.getTime() === normalizedPrev.getTime());
      return exact ?? initialDate;
    });
  }, [availableDates, initialDate, mode]);

  const groupKeyToDate = useMemo(() => {
    const normalize = mode === 'day' ? normalizeToDay : normalizeToHour;
    const map = new Map<string, Date>();
    for (const [groupKey, groupPhotos] of groupedPhotos) {
      map.set(groupKey, normalize(new Date(groupPhotos[0].taken_at)));
    }
    return map;
  }, [groupedPhotos, mode]);

  useEffect(() => {
    if (groupedPhotos.length === 0) return;

    const topOffset = isImmersive ? 80 : 140;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;

        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const best = visible[0];
        const id = (best.target as HTMLElement).id;
        const date = groupKeyToDate.get(id);
        if (!date) return;

        const normalize = mode === 'day' ? normalizeToDay : normalizeToHour;
        const next = normalize(date);
        setActiveDate(prev => {
          const prevN = normalize(prev);
          return prevN.getTime() === next.getTime() ? prev : next;
        });
      },
      { root: null, threshold: 0, rootMargin: `-${topOffset}px 0px -70% 0px` }
    );

    const elements = groupedPhotos
      .map(([groupKey]) => document.getElementById(groupKey))
      .filter((el): el is HTMLElement => Boolean(el));

    for (const el of elements) observer.observe(el);

    return () => observer.disconnect();
  }, [groupKeyToDate, groupedPhotos, isImmersive, mode]);

  const handlePhotoClick = (groupPhotos: Photo[], index: number) => {
    setViewerPhotos(groupPhotos);
    setViewerIndex(index);
  };

  const handleDateSelect = useCallback((date: Date) => {
    const normalized = mode === 'day' ? normalizeToDay(date) : normalizeToHour(date);
    setActiveDate(normalized);
    setViewerIndex(-1);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [mode]);

  useEffect(() => {
    if (availableDates.length === 0) {
      setTimelineCapsule(null);
      return;
    }

    setTimelineCapsule({
      availableDates,
      initialDate,
      value: selectedDate || activeDate,
      mode,
      onDateSelect: handleDateSelect,
    });

    return () => setTimelineCapsule(null);
  }, [activeDate, availableDates, handleDateSelect, initialDate, mode, selectedDate, setTimelineCapsule]);

  return (
    <>
      <SEO 
        title="时间轴" 
        description="按时间顺序回顾所有美好的瞬间" 
        image="/logo.png"
      />
      <div className="mx-auto max-w-6xl pb-40 md:pb-0">
      <div className={cn(
        "mb-8 sticky top-16 z-30 bg-background/95 backdrop-blur pb-4 pt-4 -mt-4 transition-all duration-300",
        isImmersive && "top-0"
      )}>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">时间轴</h1>
            <p className="text-muted-foreground">按时间顺序查看您的照片回忆</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <GridDensityToggle value={gridDensity} onChange={setGridDensity} />
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
        </div>
        <DraggableDateTimeline 
          onDateSelect={handleDateSelect} 
          className="hidden md:flex"
          availableDates={availableDates}
          initialDate={initialDate}
          value={selectedDate || activeDate}
          mode={mode}
        />
      </div>

      <div className="relative border-l border-white/10 ml-4 md:ml-8 pl-8 md:pl-12 py-4 space-y-12">
        {(isError || isTimelineError) && (
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
              columnCount={gridColumns}
              onClickPhoto={(index: number) => handlePhotoClick(groupPhotos, index)}
            />
          </div>
        ))}

        {(isLoading || isTimelineLoading) && (
          <div className="text-center py-20 text-muted-foreground">
            加载中...
          </div>
        )}

        {!isLoading && !isTimelineLoading && photos.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            暂无照片
          </div>
        )}
        {hasNextPage && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="rounded-full bg-secondary/50 px-6 py-3 text-sm font-medium hover:bg-secondary disabled:opacity-60"
            >
              {isFetchingNextPage ? '加载中...' : '加载更多'}
            </button>
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
    </>
  );
}
