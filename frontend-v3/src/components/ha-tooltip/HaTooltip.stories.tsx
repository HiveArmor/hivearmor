import type { Meta, StoryObj } from '@storybook/react';

import { HaTooltip } from './HaTooltip';
import { HaButton } from '../ha-button';

import './HaTooltip.css';

/**
 * Lifecycle: **alpha** — API may change. Registered in the HaUI Storybook tree.
 * HaTooltip is a thin, token-painted wrapper over PatternFly 6 Tooltip.
 */
const meta = {
  title: 'HaUI/HaTooltip',
  component: HaTooltip,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    lifecycle: 'alpha',
  },
  args: {
    content: 'Events per second',
    position: 'top',
    children: <span />,
  },
} satisfies Meta<typeof HaTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <HaTooltip {...args}>
      <HaButton>Hover or focus me</HaButton>
    </HaTooltip>
  ),
};

export const Positions: Story = {
  args: {
    content: 'Placed',
    children: <span />,
  },
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      {(['top', 'right', 'bottom', 'left'] as const).map((p) => (
        <HaTooltip key={p} content={`Placed ${p}`} position={p}>
          <HaButton>{p}</HaButton>
        </HaTooltip>
      ))}
    </div>
  ),
};

export const OnAnIcon: Story = {
  args: {
    content: 'Refresh the live feed',
    children: <span />,
  },
  render: (args) => (
    <HaTooltip {...args} content="Refresh the live feed">
      <button
        type="button"
        aria-label="Refresh"
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--ha-radius-control)',
          border: '1px solid var(--ha-border-default)',
          background: 'var(--ha-surface-input)',
          color: 'var(--ha-foreground-secondary)',
          cursor: 'pointer',
        }}
      >
        ⟳
      </button>
    </HaTooltip>
  ),
};
