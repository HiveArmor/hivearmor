import { useCallback, useState } from 'react';

export type RowDensity = 'compact' | 'standard' | 'comfortable';

export const ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 32,
  standard: 40,
  comfortable: 48,
};

const STORAGE_KEY = 'ha_row_density';

export function useRowDensity(): [RowDensity, (d: RowDensity) => void] {
  const [density, setDensityState] = useState<RowDensity>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'standard' || stored === 'comfortable') return stored;
    return 'compact';
  });

  const setDensity = useCallback((d: RowDensity) => {
    setDensityState(d);
    localStorage.setItem(STORAGE_KEY, d);
  }, []);

  return [density, setDensity];
}
