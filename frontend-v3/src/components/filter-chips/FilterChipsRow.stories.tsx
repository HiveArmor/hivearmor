import type { Meta, StoryObj } from '@storybook/react';

import { FilterChipsRow } from './FilterChipsRow';

const meta = {
  title: 'HiveArmor/FilterChipsRow',
  component: FilterChipsRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof FilterChipsRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleChip: Story = {
  args: {
    chips: [
      { key: 'severity', label: 'Severity: Critical', onRemove: () => {} },
    ],
    onClearAll: () => {},
  },
};

export const MultipleChips: Story = {
  args: {
    chips: [
      { key: 'severity', label: 'Severity: Critical', onRemove: () => {} },
      { key: 'status', label: 'Status: Open', onRemove: () => {} },
      { key: 'source', label: 'Source: Windows', onRemove: () => {} },
    ],
    onClearAll: () => {},
  },
};

export const Empty: Story = {
  args: {
    chips: [],
    onClearAll: () => {},
  },
};
