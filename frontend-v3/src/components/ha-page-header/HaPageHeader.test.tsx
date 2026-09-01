import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { HaPageHeader } from './HaPageHeader';
import { SiemPageHeader } from './SiemPageHeader';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaPageHeader — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'HaPageHeader.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaPageHeader.css'))).toBe(true);
    expect(typeof HaPageHeader).toBe('function');
  });

  it('no hardcoded hex in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaPageHeader.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaPageHeader.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });

  it('css is a no-fill band (transparent + bottom border, no surface fill on the root)', () => {
    const css = readFileSync(join(__dirname, 'HaPageHeader.css'), 'utf-8');
    expect(css).toMatch(/\.ha-page-header\s*\{[^}]*background:\s*transparent/);
    expect(css).toMatch(/\.ha-page-header\s*\{[^}]*border-bottom/);
  });

  it('SiemPageHeader is a working deprecated alias', () => {
    expect(typeof SiemPageHeader).toBe('function');
  });
});

describe('HaPageHeader — render', () => {
  it('renders title, description, badge, actions', () => {
    render(
      <HaPageHeader
        title="Audit Log"
        description="12,481 events"
        badge={<span data-testid="badge">3</span>}
        actions={<button type="button">Export</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
    expect(screen.getByText('12,481 events')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('renders breadcrumbs when provided', () => {
    render(
      <HaPageHeader title="Import" breadcrumbs={[{ label: 'Admin' }, { label: 'Rules' }]} />,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders tabs and fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <HaPageHeader
        title="Incident"
        tabs={[
          { id: 'a', label: 'Overview', active: true },
          { id: 'b', label: 'Alerts', count: 14, onClick },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: /Alerts/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
