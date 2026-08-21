import type { Meta, StoryObj } from '@storybook/react';

import { HaMasthead } from './HaMasthead';

/**
 * HaMasthead relies on Zustand stores (auth) and SSE hooks (eps, health).
 * In Storybook the stores are initialised empty — the masthead renders its
 * skeleton / default state, which is sufficient for visual regression.
 *
 * For full interactive testing use the running dev server.
 */
const meta = {
  title: 'HiveArmor/HaMasthead',
  component: HaMasthead,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HaMasthead>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
