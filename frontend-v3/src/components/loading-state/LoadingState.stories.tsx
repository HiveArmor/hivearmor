import type { Meta, StoryObj } from '@storybook/react';

import { LoadingState } from './LoadingState';

const meta = {
  title: 'HiveArmor/LoadingState',
  component: LoadingState,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithMessage: Story = {
  args: {
    message: 'Loading alerts…',
    rows: 5,
  },
};

export const FewRows: Story = {
  args: {
    rows: 3,
    showHeader: false,
  },
};

export const ManyRows: Story = {
  args: {
    rows: 10,
    message: 'Fetching data…',
  },
};
