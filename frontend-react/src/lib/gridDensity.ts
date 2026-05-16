import { useCallback, useEffect, useState } from 'react';

export type PhotoGridDensity = 'less' | 'more';

const STORAGE_KEY = 'photo-grid-density';

export function useStoredGridDensity(defaultValue: PhotoGridDensity = 'less') {
  const [density, setDensity] = useState<PhotoGridDensity>(() => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'less' || stored === 'more' ? stored : defaultValue;
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, density);
  }, [density]);

  return [density, setDensity] as const;
}

export function useResponsivePhotoColumns(density: PhotoGridDensity) {
  const getColumns = useCallback(() => {
    if (typeof window === 'undefined') return density === 'more' ? 4 : 3;
    const width = window.innerWidth;

    if (width < 640) return density === 'more' ? 2 : 1;
    if (width < 1024) return density === 'more' ? 3 : 2;
    return density === 'more' ? 4 : 3;
  }, [density]);

  const [columns, setColumns] = useState(getColumns);

  useEffect(() => {
    const updateColumns = () => setColumns(getColumns());
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [getColumns]);

  return columns;
}
