import type { Meta, StoryObj } from '@storybook/react';

import { HaDefinitionList } from './HaDefinitionList';

/** Lifecycle: **alpha**. Semantic dl key/value list extracted from the app's many detail lists. */
const meta = {
  title: 'HaUI/HaDefinitionList',
  component: HaDefinitionList,
  tags: ['autodocs'],
  parameters: { layout: 'padded', lifecycle: 'alpha' },
  args: {
    items: [
      { term: 'IP Address', value: '10.0.14.203', mono: true },
      { term: 'Hostname', value: 'HOST-1000', mono: true },
      { term: 'Process', value: 'powershell.exe', mono: true },
      { term: 'Username', value: 'a.khan', mono: true },
      { term: 'Note', value: 'Flagged by brute-force rule' },
    ],
  },
} satisfies Meta<typeof HaDefinitionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Stacked: Story = { args: { layout: 'stacked' } };
export const Inline: Story = { args: { layout: 'inline' } };
