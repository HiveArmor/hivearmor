import type { Meta, StoryObj } from '@storybook/react';

import { HaPopover } from './HaPopover';

/**
 * Lifecycle: **alpha** — API may change. Registered in the HaUI Storybook tree.
 * The anchored-panel shell extracted from AddFilterPopover + FieldSelectorPopover.
 */
const meta = {
  title: 'HaUI/HaPopover',
  component: HaPopover,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    lifecycle: 'alpha',
  },
} satisfies Meta<typeof HaPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

const triggerBtn = (
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
    Open panel
  </button>
);

export const Default: Story = {
  args: {
    trigger: triggerBtn,
    ariaLabel: 'Example panel',
    width: 260,
    children: (
      <div style={{ padding: 12, font: 'var(--ha-type-body)', color: 'var(--ha-foreground-primary)' }}>
        Panel content lives in the consumer. HaPopover owns open/close, click-outside, Escape, focus
        return, positioning, and a11y.
      </div>
    ),
  },
};

export const WithCloseButton: Story = {
  args: {
    trigger: triggerBtn,
    ariaLabel: 'Panel with close',
    width: 240,
    children: ({ close }) => (
      <div style={{ padding: 12, display: 'grid', gap: 10 }}>
        <span style={{ font: 'var(--ha-type-body)' }}>Uses the render-prop close().</span>
        <button
          type="button"
          onClick={close}
          style={{
            height: 28,
            borderRadius: 'var(--ha-radius-control)',
            border: '1px solid var(--ha-action-primary)',
            background: 'var(--ha-action-primary)',
            color: 'var(--ha-foreground-on-action)',
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    ),
  },
};
