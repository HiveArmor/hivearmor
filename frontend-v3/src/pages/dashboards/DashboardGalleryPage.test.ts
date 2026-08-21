/**
 * DashboardGalleryPage Tests
 */

import { describe, it, expect } from 'vitest';

import { DashboardGalleryPage } from './DashboardGalleryPage';
import { DashboardViewPage } from './DashboardViewPage';

describe('DashboardGalleryPage', () => {
  it('should export DashboardGalleryPage component', () => {
    expect(DashboardGalleryPage).toBeDefined();
    expect(typeof DashboardGalleryPage).toBe('function');
  });
});

describe('DashboardViewPage', () => {
  it('should export DashboardViewPage component', () => {
    expect(DashboardViewPage).toBeDefined();
    expect(typeof DashboardViewPage).toBe('function');
  });
});
