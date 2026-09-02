import type { Meta, StoryObj } from '@storybook/react';

import { ErrorState } from './ErrorState';

const meta = {
  title: 'HaUI/ErrorState',
  component: ErrorState,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithRetry: Story = {
  args: {
    title: 'Failed to load alerts',
    message: 'The server returned an error. Please try again.',
    onRetry: () => alert('Retry clicked'),
  },
};

export const NetworkError: Story = {
  args: {
    title: 'Connection error',
    message: 'Unable to reach the server. Check your network connection.',
    onRetry: () => alert('Retry clicked'),
  },
};

export const WithErrorObject: Story = {
  args: {
    title: 'Unexpected error',
    message: 'An unexpected error occurred.',
    error: new Error('TypeError: Cannot read properties of undefined\n    at AlertsPage.tsx:42:12'),
    onRetry: () => alert('Retry clicked'),
  },
};
