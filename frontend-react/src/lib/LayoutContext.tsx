import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface LayoutContextType {
  // PhotoViewer 打开时隐藏胶囊
  isViewerOpen: boolean;
  setViewerOpen: (open: boolean) => void;
  // 滚动时隐藏顶栏和胶囊（用于沉浸式浏览）
  isImmersive: boolean;
  setImmersive: (immersive: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [isViewerOpen, setViewerOpen] = useState(false);
  const [isImmersive, setImmersive] = useState(false);

  return (
    <LayoutContext.Provider value={{ 
      isViewerOpen, 
      setViewerOpen, 
      isImmersive, 
      setImmersive 
    }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider');
  }
  return context;
}

// 滚动隐藏 hook
export function useScrollHide(threshold = 50) {
  const { setImmersive } = useLayout();
  const [lastScrollY, setLastScrollY] = useState(0);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > lastScrollY && currentScrollY > threshold) {
      // 向下滚动且超过阈值，进入沉浸模式
      setImmersive(true);
    } else if (currentScrollY < lastScrollY) {
      // 向上滚动，退出沉浸模式
      setImmersive(false);
    }
    
    setLastScrollY(currentScrollY);
  }, [lastScrollY, threshold, setImmersive]);

  return handleScroll;
}
