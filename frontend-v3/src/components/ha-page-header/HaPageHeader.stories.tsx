import type { Meta, StoryObj } from '@storybook/react';

import { HaPageHeader } from './HaPageHeader';

/** Lifecycle: **alpha**. The locked compact no-fill page-context band (design §8), replaces SiemPageHeader. */
const meta = {
  title: 'HaUI/HaPageHeader',
  component: HaPageHeader,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', lifecycle: 'alpha' },
  args: { title: 'Alerts' },
} satisfies Meta<typeof HaPageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const btn = (label: string): JSX.Element => (
  <button
    type="button"
    style={{
      height: 28,
      padding: '0 12px',
      borderRadius: 'var(--ha-radius-control)',
      border: '1px solid var(--ha-border-default)',
      background: 'var(--ha-surface-input)',
      color: 'var(--ha-foreground-secondary)',
      cursor: 'pointer',
    }}
  >
    {label}
  </button>
);

export const FlatPage: Story = {
  args: {
    title: 'Audit Log',
    description: '12,481 events · updated 3s ago',
    actions: btn('Export'),
  },
};

export const DrillDownWithBreadcrumbAndTabs: Story = {
  args: {
    title: 'INC-2481',
    description: 'opened 12m ago · P1',
    breadcrumbs: [{ label: 'Incidents', href: '#' }, { label: 'INC-2481' }],
    actions: btn('Contain'),
    tabs: [
      { id: 'ov', label: 'Overview', active: true },
      { id: 'al', label: 'Alerts', count: 14 },
      { id: 'tl', label: 'Timeline' },
      { id: 'ev', label: 'Evidence', count: 7 },
    ],
  },
};
