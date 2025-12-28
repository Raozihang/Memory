import { Photo } from '@/lib/types';
import { PhotoCard } from '@/components/PhotoCard';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface JustifiedPhotoGridProps {
  photos: Photo[];
  targetRowHeight?: number;
  onClickPhoto: (index: number) => void;
  className?: string;
}

export function JustifiedPhotoGrid({ 
  photos, 
  targetRowHeight = 300, 
  onClickPhoto,
  className 
}: JustifiedPhotoGridProps) {
  // 存储每张照片的实际宽高比
  const [aspectRatios] = useState<Record<string, number>>({});

  // PhotoCard 内部会处理图片加载和宽高比

  return (
    <div className={cn("flex flex-wrap gap-2 sm:gap-3", className)}>
      {photos.map((photo, index) => {
        // 默认假设横向照片 (4:3)，实际比例会在加载后更新
        const aspect = aspectRatios[photo.id] || 1.33;
        // 根据宽高比计算宽度
        const width = Math.floor(targetRowHeight * aspect);
        // 竖图 (aspect < 1) 需要限制最大宽度，避免占用太多空间
        const isPortrait = aspect < 1;
        
        return (
          <div 
            key={photo.id} 
            className={cn(
              "relative overflow-hidden rounded-xl bg-muted transition-all duration-300",
              isPortrait ? "flex-grow-0 flex-shrink-0" : "flex-grow flex-shrink"
            )}
            style={{ 
              height: targetRowHeight,
              flexBasis: width,
              maxWidth: isPortrait ? Math.floor(targetRowHeight * aspect) : undefined,
              minWidth: Math.max(80, Math.floor(targetRowHeight * 0.3))
            }}
          >
            <PhotoCard 
              photo={photo} 
              variant="justified"
              aspectRatio={aspect}
              onClick={() => onClickPhoto(index)}
              className="h-full w-full rounded-none bg-transparent flex items-center justify-center"
            />
          </div>
        );
      })}
      {/* Spacer to prevent last row from expanding too much */}
      <div className="flex-grow-[9999] basis-auto min-w-[20%] h-0"></div>
    </div>
  );
}
