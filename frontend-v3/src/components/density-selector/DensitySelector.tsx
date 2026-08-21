import type { RowDensity } from '@/hooks/useRowDensity';
import { useRowDensity } from '@/hooks/useRowDensity';

const OPTIONS: { key: RowDensity; label: string; icon: string }[] = [
  { key: 'compact', label: 'Compact', icon: '≡≡≡' },
  { key: 'standard', label: 'Standard', icon: '≡≡' },
  { key: 'comfortable', label: 'Comfortable', icon: '≡' },
];

export function DensitySelector(): JSX.Element {
  const [density, setDensity] = useRowDensity();

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => setDensity(opt.key)}
          title={`${opt.label} row density`}
          type="button"
          style={{
            background: density === opt.key ? 'var(--ha-surface-primary)' : 'transparent',
            border: `1px solid ${density === opt.key ? 'var(--ha-primary)' : 'var(--ha-border)'}`,
            borderRadius: 'var(--ha-radius-sm)',
            color: density === opt.key ? 'var(--ha-primary)' : 'var(--ha-text-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--ha-text-xs)',
            padding: '4px 8px',
            transition: 'color 120ms, border-color 120ms, background 120ms',
          }}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
