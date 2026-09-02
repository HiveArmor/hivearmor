import type { Meta, StoryObj } from '@storybook/react';
import { Shield } from 'lucide-react';

import { EmptyState } from './EmptyState';

import { HaButton } from '@/components/ha-button/HaButton';

const meta = {
  title: 'HaUI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'No alerts found',
    description: 'No alerts match your current filters. Try adjusting your search criteria.',
  },
};

export const WithIcon: Story = {
  args: {
    icon: <Shield size={48} />,
    title: 'No active threats',
    description: 'Your environment is clean. No threats detected in the selected time range.',
  },
};

export const WithAction: Story = {
  args: {
    icon: <Shield size={48} />,
    title: 'No incidents yet',
    description: 'Create your first incident to start tracking security events.',
    action: <HaButton variant="primary">Create Incident</HaButton>,
  },
};
