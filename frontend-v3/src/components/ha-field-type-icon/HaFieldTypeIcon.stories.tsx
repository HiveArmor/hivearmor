import type { Meta, StoryObj } from '@storybook/react';

import { HaFieldTypeIcon, type HaFieldType } from './HaFieldTypeIcon';

const meta = {
  title: 'HaUI/HaFieldTypeIcon',
  component: HaFieldTypeIcon,
  parameters: { lifecycle: 'beta' },
  tags: ['autodocs'],
} satisfies Meta<typeof HaFieldTypeIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL_TYPES: HaFieldType[] = ['date', 'keyword', 'text', 'ip', 'number', 'boolean'];

export const Default: Story = { args: { type: 'ip', labelled: true } };

export const AllTypes: Story = {
  args: { type: 'ip' },
  render: () => (
    <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
      {ALL_TYPES.map((type) => (
        <li key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HaFieldTypeIcon type={type} labelled />
          <code>{type}</code>
        </li>
      ))}
    </ul>
  ),
};

export const UnknownType: Story = { args: { type: 'geo_point', labelled: true } };
