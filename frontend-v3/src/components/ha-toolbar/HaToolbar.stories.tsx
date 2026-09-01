import type { Meta, StoryObj } from '@storybook/react';

import { HaToolbar } from './HaToolbar';

/** Lifecycle: **alpha**. The locked sticky control strip under HaPageHeader (design §8). */
const meta = {
  title: 'HaUI/HaToolbar',
  component: HaToolbar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', lifecycle: 'alpha' },
} satisfies Meta<typeof HaToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

const chipBtn = (label: string): JSX.Element => (
  <button
    type="button"
    style={{
      height: 28,
      padding: '0 10px',
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

export const Default: Story = {
  args: {
    sticky: false,
    left: (
      <>
        {chipBtn('Last 24 hours ▾')}
        {chipBtn('Saved views ▾')}
      </>
    ),
    right: <span style={{ font: 'var(--ha-type-compact)', color: 'var(--ha-foreground-secondary)' }}>Showing 100 of 48,213</span>,
  },
};

export const WithFilterChips: Story = {
  args: {
    sticky: false,
    left: chipBtn('＋ Add filter'),
    activeFilters: [
      { label: 'Severity: Critical, High', onRemove: () => {} },
      { label: 'Status: Open', onRemove: () => {} },
    ],
    onClearAllFilters: () => {},
  },
};
