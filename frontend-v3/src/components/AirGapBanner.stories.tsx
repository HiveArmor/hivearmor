import { useEffect } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent } from 'storybook/test';

import { AirGapBanner } from './AirGapBanner';
import { useSystemInfoStore } from '../store/systemInfoStore';

/**
 * Storybook stories for AirGapBanner.
 * Validates: Requirements 11.3, 11.4, 11.7
 */

/** Decorator that sets the Zustand store to air-gap mode active */
function WithAirGapEnabled({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    useSystemInfoStore.getState().setSystemInfo({
      appName: 'HiveArmor',
      version: '11.0.0',
      airGapMode: true,
      osVersion: 'Linux 6.1',
      javaVersion: '17.0.9',
    });
  }, []);
  return <>{children}</>;
}

/** Decorator that sets the Zustand store to air-gap mode disabled */
function WithAirGapDisabled({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    useSystemInfoStore.getState().setSystemInfo({
      appName: 'HiveArmor',
      version: '11.0.0',
      airGapMode: false,
      osVersion: 'Linux 6.1',
      javaVersion: '17.0.9',
    });
  }, []);
  return <>{children}</>;
}

const meta = {
  title: 'HaUI/AirGapBanner',
  component: AirGapBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AirGapBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default — banner visible when airGapMode is true */
export const Default: Story = {
  decorators: [
    (Story) => (
      <WithAirGapEnabled>
        <Story />
      </WithAirGapEnabled>
    ),
  ],
};

/** Hidden — banner not rendered when airGapMode is false */
export const Hidden: Story = {
  decorators: [
    (Story) => (
      <WithAirGapDisabled>
        <Story />
      </WithAirGapDisabled>
    ),
  ],
};

/** Dismissed — banner state after user clicks dismiss */
export const Dismissed: Story = {
  decorators: [
    (Story) => (
      <WithAirGapEnabled>
        <Story />
      </WithAirGapEnabled>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dismissButton = await canvas.findByRole('button', {
      name: /dismiss air-gap notice/i,
    });
    await userEvent.click(dismissButton);
  },
};
