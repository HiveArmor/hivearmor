import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { HaCompactSelect } from './HaCompactSelect';

/**
 * HaCompactSelect — token-styled dropdown (button trigger + HaPopover listbox), NOT a native
 * <select>. lifecycle: stable.
 */
const meta = {
  title: 'HaUI/HaCompactSelect',
  component: HaCompactSelect,
  parameters: { lifecycle: 'stable' },
  tags: ['autodocs'],
} satisfies Meta<typeof HaCompactSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

const OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function Interactive({ label, layout }: { label?: string; layout?: 'inline' | 'stacked' }): JSX.Element {
  const [value, setValue] = useState('all');
  return (
    <div style={{ width: 240 }}>
      <HaCompactSelect
        ariaLabel="Severity"
        label={label}
        layout={layout}
        value={value}
        options={OPTIONS}
        onChange={setValue}
      />
    </div>
  );
}

export const Inline: Story = { args: { ariaLabel: 'Severity', value: 'all', options: OPTIONS, onChange: () => {} }, render: () => <Interactive /> };
export const WithLabel: Story = { args: { ariaLabel: 'Severity', value: 'all', options: OPTIONS, onChange: () => {} }, render: () => <Interactive label="Severity" /> };
export const Stacked: Story = { args: { ariaLabel: 'Severity', value: 'all', options: OPTIONS, onChange: () => {} }, render: () => <Interactive label="Severity" layout="stacked" /> };
export const Disabled: Story = {
  args: { ariaLabel: 'Severity', label: 'Severity', value: 'all', options: OPTIONS, onChange: () => {}, disabled: true },
};
