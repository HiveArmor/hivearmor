import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { HaMenu } from './HaMenu';

/** Lifecycle: **alpha**. Dropdown menu built on HaPopover; extracted from three column/scope pickers. */
const meta = {
  title: 'HaUI/HaMenu',
  component: HaMenu,
  tags: ['autodocs'],
  parameters: { layout: 'centered', lifecycle: 'alpha' },
} satisfies Meta<typeof HaMenu>;

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
    Columns
  </button>
);

export const ColumnPicker: Story = {
  args: { trigger: triggerBtn, ariaLabel: 'Columns', children: null },
  render: (args) => {
    const Demo = (): JSX.Element => {
      const [cols, setCols] = useState<string[]>(['host', 'tags']);
      const toggle = (id: string): void =>
        setCols((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
      return (
        <HaMenu {...args} width={210}>
          <HaMenu.Label>Optional columns</HaMenu.Label>
          {['host', 'tags', 'hash', 'user'].map((id) => (
            <HaMenu.CheckboxItem key={id} checked={cols.includes(id)} onToggle={() => toggle(id)}>
              {id}
            </HaMenu.CheckboxItem>
          ))}
        </HaMenu>
      );
    };
    return <Demo />;
  },
};

export const ActionMenu: Story = {
  args: { trigger: triggerBtn, ariaLabel: 'Actions', children: null },
  render: (args) => (
    <HaMenu {...args} width={180}>
      <HaMenu.Item>Investigate</HaMenu.Item>
      <HaMenu.Item>Assign to me</HaMenu.Item>
      <HaMenu.Item disabled>Close (no permission)</HaMenu.Item>
    </HaMenu>
  ),
};
