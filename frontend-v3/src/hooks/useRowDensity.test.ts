import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { useRowDensity, ROW_HEIGHTS } from './useRowDensity';

describe('useRowDensity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to compact when no stored value', () => {
    const { result } = renderHook(() => useRowDensity());
    expect(result.current[0]).toBe('compact');
  });

  it('reads stored value from localStorage', () => {
    localStorage.setItem('ha_row_density', 'standard');
    const { result } = renderHook(() => useRowDensity());
    expect(result.current[0]).toBe('standard');
  });

  it('falls back to compact for invalid stored values', () => {
    localStorage.setItem('ha_row_density', 'invalid');
    const { result } = renderHook(() => useRowDensity());
    expect(result.current[0]).toBe('compact');
  });

  it('persists selected density to localStorage', () => {
    const { result } = renderHook(() => useRowDensity());
    act(() => {
      result.current[1]('comfortable');
    });
    expect(result.current[0]).toBe('comfortable');
    expect(localStorage.getItem('ha_row_density')).toBe('comfortable');
  });

  it('ROW_HEIGHTS maps densities to correct pixel values', () => {
    expect(ROW_HEIGHTS.compact).toBe(32);
    expect(ROW_HEIGHTS.standard).toBe(40);
    expect(ROW_HEIGHTS.comfortable).toBe(48);
  });
});
