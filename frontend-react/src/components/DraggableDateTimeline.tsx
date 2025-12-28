import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, useMotionValue, useAnimation, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';

interface DraggableDateTimelineProps {
  initialDate?: Date;
  onDateSelect?: (date: Date) => void;
  className?: string;
  availableDates?: Date[];
  mode?: 'day' | 'hour';
}

const ITEM_WIDTH = 96;
const BUFFER_HOURS = 24 * 30;
const DAY_ITEM_WIDTH = 80;
const BUFFER_DAYS = 365;

export function DraggableDateTimeline({ initialDate = new Date(), onDateSelect, className, availableDates, mode = 'hour' }: DraggableDateTimelineProps) {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const normalizeToDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const normalizeToHour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
  const itemWidth = mode === 'day' ? DAY_ITEM_WIDTH : ITEM_WIDTH;

  const [selectedDate, setSelectedDate] = useState(() => (mode === 'day' ? normalizeToDay(initialDate) : normalizeToHour(initialDate)));
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const controls = useAnimation();
  const x = useMotionValue(0);

  // Generate date range or use availableDates
  const dates = useMemo(() => {
    if (availableDates && availableDates.length > 0) {
      const unique = new Map<number, Date>();
      for (const d of availableDates) {
        const normalized = mode === 'day' ? normalizeToDay(d) : normalizeToHour(d);
        unique.set(normalized.getTime(), normalized);
      }
      return [...unique.values()].sort((a, b) => a.getTime() - b.getTime());
    }

    const arr = [];
    if (mode === 'day') {
      const start = normalizeToDay(initialDate);
      start.setDate(start.getDate() - BUFFER_DAYS);
      for (let i = 0; i < BUFFER_DAYS * 2 + 1; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        arr.push(d);
      }
      return arr;
    }

    const start = normalizeToHour(initialDate);
    start.setHours(start.getHours() - BUFFER_HOURS);
    for (let i = 0; i < BUFFER_HOURS * 2 + 1; i++) {
      const d = new Date(start);
      d.setHours(d.getHours() + i);
      arr.push(d);
    }
    return arr;
  }, [initialDate, availableDates, mode]);

  const isSameItem = useCallback((d1: Date, d2: Date) => {
    if (mode === 'day') {
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate();
    }

    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate() &&
           d1.getHours() === d2.getHours();
  }, [mode]);

  useEffect(() => {
    setSelectedDate(prev => (mode === 'day' ? normalizeToDay(prev) : normalizeToHour(prev)));
  }, [mode]);

  useEffect(() => {
    if (availableDates && availableDates.length > 0 && dates.length > 0) {
      const inList = dates.some(d => isSameItem(d, selectedDate));
      if (!inList) {
        setSelectedDate(dates[dates.length - 1]);
      }
    }
  }, [availableDates, dates, selectedDate, isSameItem]);

  // Handle resize to keep centered
  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
      const handleResize = () => setContainerWidth(containerRef.current?.offsetWidth || 0);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Initialize position to center the selected date
  useEffect(() => {
    if (containerWidth > 0) {
      const index = dates.findIndex(d => isSameItem(d, selectedDate));
      if (index !== -1) {
        const targetX = containerWidth / 2 - (index * itemWidth + itemWidth / 2);
        controls.start({ x: targetX, transition: { type: "spring", stiffness: 300, damping: 30 } });
        x.set(targetX); 
      }
    }
  }, [containerWidth, controls, dates, selectedDate, x, itemWidth, isSameItem]); 

  // Handle drag end to snap to nearest date
  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const currentX = x.get() + info.velocity.x * 0.2; // Add inertia
    const centerOffset = containerWidth / 2;
    // Calculate which index is closest to the center
    // Formula: center = x + index * width + width/2
    // => x = center - index * width - width/2
    // => index * width = center - width/2 - x
    // => index = (center - width/2 - x) / width
    const index = Math.round((centerOffset - itemWidth / 2 - currentX) / itemWidth);
    const clampedIndex = Math.max(0, Math.min(index, dates.length - 1));
    
    const targetX = centerOffset - (clampedIndex * itemWidth + itemWidth / 2);
    
    controls.start({ 
      x: targetX, 
      transition: { type: "spring", stiffness: 400, damping: 40 } 
    });
    
    const date = dates[clampedIndex];
    if (!isSameItem(date, selectedDate)) {
        setSelectedDate(date);
        onDateSelect?.(date);
    }
  };

  const formatDate = (date: Date) => {
    if (mode === 'day') {
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:00`;
  };

  const handleHeaderClick = () => {
    const input = document.getElementById('hidden-date-input') as HTMLInputElement;
    if (input) {
        try {
            if ('showPicker' in input) {
                (input as any).showPicker();
            } else {
                (input as any).click();
            }
        } catch {
            (input as any).click();
        }
    }
  };

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.value) {
          const [datePart, timePart] = e.target.value.split('T');
          const [y, m, d] = (datePart || '').split('-').map(Number);
          const [hh, mm] = (timePart || '').split(':').map(Number);
          const raw = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
          const newDate = mode === 'day' ? normalizeToDay(raw) : normalizeToHour(raw);
          // Check if date is within range
          const index = dates.findIndex(d => isSameItem(d, newDate));
          
          if (index !== -1) {
             setSelectedDate(newDate);
             onDateSelect?.(newDate);
             const targetX = containerWidth / 2 - (index * itemWidth + itemWidth / 2);
             controls.start({ x: targetX, transition: { duration: 0.5, ease: "easeInOut" } });
          } else {
              // If out of range, we might want to regenerate dates, but for now just alert or ignore
              // Ideally we would regenerate the dates prop or handle it in parent
              console.warn("Date out of range");
              // For a simple implementation, we update the selected date but it won't be centered in the list if not in list
              // But let's assume usage within +/- 1 year for this demo
              setSelectedDate(newDate);
              onDateSelect?.(newDate);
          }
      }
  };

  return (
    <div className={cn("w-full flex flex-col items-center gap-6", className)}>
      {/* Header Date Display */}
      <div className="relative cursor-pointer group text-center" onClick={handleHeaderClick}>
         <h2 className="text-3xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
           {formatDate(selectedDate)}
         </h2>
         <p className="text-sm font-medium text-muted-foreground mt-1 group-hover:text-primary/80">{mode === 'day' ? '点击选择日期' : '点击选择时间'}</p>
         <input 
            id="hidden-date-input"
            type={mode === 'day' ? 'date' : 'datetime-local'} 
            step={mode === 'day' ? undefined : 3600}
            className="absolute opacity-0 pointer-events-none top-0 left-0 w-full h-full"
            onChange={handleDateInputChange}
         />
      </div>

      {/* Draggable Timeline Area */}
      <div 
        ref={containerRef} 
        className="w-full relative h-28 bg-background/50 backdrop-blur-sm border-y border-border overflow-hidden select-none touch-none"
      >
        {/* Center Indicator Gradient/Line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-primary z-20 -translate-x-1/2 pointer-events-none shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
        
        {/* Fade Gradients */}
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <motion.div
          className="flex items-center h-full absolute top-0 left-0 cursor-grab active:cursor-grabbing"
          style={{ x }}
          animate={controls}
          drag="x"
          dragConstraints={{ left: -100000, right: 100000 }} // Virtual constraints
          dragElastic={0.1}
          dragMomentum={false} // We handle momentum manually for snapping
          onDragEnd={handleDragEnd}
        >
           {dates.map((date, i) => {
             const isSelected = isSameItem(date, selectedDate);
             return (
               <div 
                 key={date.getTime()} 
                 className={cn(
                    "flex-shrink-0 flex flex-col items-center justify-center h-full transition-all duration-300",
                    isSelected ? "opacity-100 scale-110 font-bold" : "opacity-40 scale-90 hover:opacity-60"
                 )}
                 style={{ width: itemWidth }}
                 onClick={() => {
                    const targetX = containerWidth / 2 - (i * itemWidth + itemWidth / 2);
                    controls.start({ x: targetX, transition: { type: "spring", stiffness: 300, damping: 30 } });
                    setSelectedDate(date);
                    onDateSelect?.(date);
                 }}
               >
                 {mode === 'day' ? (
                   <>
                     <span className="text-xs uppercase text-muted-foreground mb-1">
                       {["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}
                     </span>
                     <span className={cn("text-xl rounded-full w-10 h-10 flex items-center justify-center", isSelected ? "bg-primary text-primary-foreground" : "text-foreground")}>
                       {date.getDate()}
                     </span>
                   </>
                 ) : (
                   <>
                     <span className="text-xs uppercase text-muted-foreground mb-1">
                       {date.getMonth() + 1}/{date.getDate()} {["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}
                     </span>
                     <span className={cn("text-sm rounded-full px-3 py-2 flex items-center justify-center", isSelected ? "bg-primary text-primary-foreground" : "text-foreground")}>
                       {pad2(date.getHours())}:00
                     </span>
                   </>
                 )}
               </div>
             );
           })}
        </motion.div>
      </div>
    </div>
  );
}
