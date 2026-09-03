import type { Meta, StoryObj } from '@storybook/react';

/**
 * Foundations / Theme Modes
 * -------------------------------------------------------------------------
 * A living reference for the three shipped themes (Dark / Modern / White).
 * Use the "Theme" toolbar toggle (top of the Storybook canvas) to switch —
 * every swatch below reads the LIVE CSS custom properties, so it always
 * reflects the active theme. This replaces the throwaway .plan/*.html showcase.
 */

const SWATCH_GROUPS: Array<{ heading: string; tokens: string[] }> = [
  {
    heading: 'Surfaces',
    tokens: [
      '--ha-surface-app',
      '--ha-surface-sidebar',
      '--ha-surface-panel',
      '--ha-surface-elevated',
      '--ha-surface-input',
      '--ha-surface-hover',
      '--ha-surface-selected',
    ],
  },
  {
    heading: 'Borders',
    tokens: ['--ha-border-subtle', '--ha-border-default', '--ha-border-strong', '--ha-border-focus'],
  },
  {
    heading: 'Text',
    tokens: [
      '--ha-foreground-primary',
      '--ha-foreground-secondary',
      '--ha-foreground-tertiary',
      '--ha-foreground-link',
    ],
  },
  {
    heading: 'Interaction (teal)',
    tokens: ['--ha-action-primary', '--ha-action-primary-hover', '--ha-action-secondary'],
  },
  {
    heading: 'Severity',
    tokens: [
      '--ha-severity-critical',
      '--ha-severity-high',
      '--ha-severity-medium',
      '--ha-severity-low',
      '--ha-severity-info',
    ],
  },
  {
    heading: 'Intelligence & brand',
    tokens: ['--ha-intelligence-primary', '--ha-brand-primary', '--ha-brand-hot'],
  },
];

const RADII: string[] = [
  '--ha-radius-control',
  '--ha-radius-panel',
  '--ha-radius-workspace',
];

function Swatch({ token }: { token: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 132 }}>
      <div
        style={{
          height: 44,
          borderRadius: 'var(--ha-radius-control)',
          background: `var(${token})`,
          border: '1px solid var(--ha-border-default)',
        }}
      />
      <code style={{ fontSize: 10, color: 'var(--ha-foreground-tertiary)' }}>{token.replace('--ha-', '')}</code>
    </div>
  );
}

function ThemeModes() {
  return (
    <div style={{ color: 'var(--ha-foreground-primary)', fontFamily: 'var(--ha-font-ui)' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Theme Modes</h2>
      <p style={{ margin: '0 0 20px', color: 'var(--ha-foreground-secondary)', fontSize: 13 }}>
        Switch the <strong>Theme</strong> toolbar toggle above between Dark, Modern, and White. Every
        swatch reads the live token, so this reflects the active theme.
      </p>

      {SWATCH_GROUPS.map((group) => (
        <section key={group.heading} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, margin: '0 0 10px', color: 'var(--ha-foreground-secondary)' }}>
            {group.heading}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {group.tokens.map((token) => (
              <Swatch key={token} token={token} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <h3 style={{ fontSize: 13, margin: '0 0 10px', color: 'var(--ha-foreground-secondary)' }}>
          Radius scale (squared)
        </h3>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
          {RADII.map((token) => (
            <div key={token} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <div
                style={{
                  width: 72,
                  height: 48,
                  borderRadius: `var(${token})`,
                  background: 'var(--ha-surface-elevated)',
                  border: '1px solid var(--ha-border-strong)',
                }}
              />
              <code style={{ fontSize: 10, color: 'var(--ha-foreground-tertiary)' }}>
                {token.replace('--ha-radius-', '')}
              </code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const meta = {
  title: 'Foundations/Theme Modes',
  component: ThemeModes,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ThemeModes>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tokens: Story = {};
