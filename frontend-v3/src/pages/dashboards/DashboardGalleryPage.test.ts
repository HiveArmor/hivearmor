/**
 * DashboardGalleryPage Tests — Prompt 31 / Wave C1 opener
 */

import { describe, it, expect } from 'vitest';

import { DASHBOARD_GALLERY_JOB_SENTENCE, DashboardGalleryPage } from './DashboardGalleryPage';
import { DashboardViewPage } from './DashboardViewPage';

describe('DashboardGalleryPage', () => {
  it('should export DashboardGalleryPage component', () => {
    expect(DashboardGalleryPage).toBeDefined();
    expect(typeof DashboardGalleryPage).toBe('function');
  });

  it('exports gallery job sentence distinct from Studio authoring', () => {
    expect(DASHBOARD_GALLERY_JOB_SENTENCE).toMatch(/Dashboard gallery/i);
    expect(DASHBOARD_GALLERY_JOB_SENTENCE).toMatch(/Studio/i);
  });
});

describe('DashboardViewPage', () => {
  it('should export DashboardViewPage component', () => {
    expect(DashboardViewPage).toBeDefined();
    expect(typeof DashboardViewPage).toBe('function');
  });
});
