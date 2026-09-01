import type { Meta, StoryObj } from '@storybook/react';

import { HaCard } from './HaCard';

/**
 * Lifecycle: **alpha** — API may change. Registered in the HaUI Storybook tree.
 * The card surface primitive extracted from Evidence / LlmUnavailable / AiIncidentSummary /
 * IntelligenceFinding cards.
 */
const meta = {
  title: 'HaUI/HaCard',
  component: HaCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded', lifecycle: 'alpha' },
} satisfies Meta<typeof HaCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeaderBodyFooter: Story = {
  args: { children: null },
  render: () => (
    <HaCard style={{ maxWidth: 380 }}>
      <HaCard.Header>
        <strong style={{ font: 'var(--ha-type-section-title)' }}>Evidence · log excerpt</strong>
        <span style={{ font: 'var(--ha-type-metadata)', color: 'var(--ha-foreground-tertiary)' }}>
          2m ago
        </span>
      </HaCard.Header>
      <HaCard.Body>
        <span style={{ font: 'var(--ha-type-body)' }}>
          The card owns surface, border, radius, and dividers. Content lives in the slots.
        </span>
      </HaCard.Body>
      <HaCard.Footer>
        <span style={{ font: 'var(--ha-type-metadata)', color: 'var(--ha-foreground-tertiary)' }}>
          Added by a.khan
        </span>
      </HaCard.Footer>
    </HaCard>
  ),
};

export const SurfaceOnly: Story = {
  args: { children: null },
  render: () => (
    <HaCard style={{ maxWidth: 320 }}>
      <HaCard.Body>
        <div style={{ textAlign: 'center', color: 'var(--ha-foreground-secondary)' }}>
          A card that is just a surface — e.g. a null-state. No header/footer.
        </div>
      </HaCard.Body>
    </HaCard>
  ),
};

export const Compact: Story = {
  args: { children: null },
  render: () => (
    <HaCard compact style={{ maxWidth: 320 }}>
      <HaCard.Header>
        <strong style={{ font: 'var(--ha-type-compact)' }}>Compact</strong>
      </HaCard.Header>
      <HaCard.Body>Tighter padding for dense contexts.</HaCard.Body>
    </HaCard>
  ),
};
