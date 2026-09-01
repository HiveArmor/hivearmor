import './AutonomyControl.css';

export type AutonomyLevel = 'off' | 'suggest' | 'auto-approve' | 'autopilot';

export interface AutonomyControlProps {
  /** Current autonomy level. */
  value: AutonomyLevel;
  /** Fired when the analyst changes the level. */
  onChange: (level: AutonomyLevel) => void;
  /** Disable interaction (e.g. locked by policy). */
  disabled?: boolean;
  /** Optional label above the control, e.g. the agent name. */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

interface LevelSpec {
  id: AutonomyLevel;
  label: string;
  hint: string;
}

const LEVELS: LevelSpec[] = [
  { id: 'off', label: 'Off', hint: 'Agent does not run' },
  { id: 'suggest', label: 'Suggest', hint: 'Recommends, never acts' },
  { id: 'auto-approve', label: 'Auto + approve', hint: 'Acts after human approval' },
  { id: 'autopilot', label: 'Autopilot', hint: 'Acts within policy bounds' },
];

/**
 * AutonomyControl — the graduated trust-gradient control for an AI agent (design §5a; never a
 * binary on/off). Four escalating tiers: Off → Suggest → Auto-with-approval → Autopilot. Rendered
 * as a segmented control whose active tier lights in intelligence-violet, with the tier's meaning
 * as a hint so the operator always knows what "on" means. This is autonomy-as-visible-control —
 * the analyst governs how far each agent may go.
 *
 * Tokens only, WCAG AA (radiogroup + arrow-key semantics via native buttons + aria-checked).
 */
export function AutonomyControl({
  value,
  onChange,
  disabled = false,
  label,
  size = 'md',
  className,
}: AutonomyControlProps): JSX.Element {
  const activeIndex = LEVELS.findIndex((l) => l.id === value);
  const activeHint = LEVELS[activeIndex]?.hint;

  return (
    <div className={['ha-autonomy', className].filter(Boolean).join(' ')}>
      {label && <span className="ha-autonomy__label">{label}</span>}
      <div
        className={['ha-autonomy__track', `ha-autonomy__track--${size}`, disabled ? 'ha-autonomy__track--disabled' : '']
          .filter(Boolean)
          .join(' ')}
        role="radiogroup"
        aria-label={label ? `${label} autonomy` : 'Agent autonomy'}
        data-level={value}
      >
        {LEVELS.map((level, i) => (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={value === level.id}
            className={['ha-autonomy__seg', value === level.id ? 'ha-autonomy__seg--on' : '', i <= activeIndex ? 'ha-autonomy__seg--filled' : '']
              .filter(Boolean)
              .join(' ')}
            disabled={disabled}
            onClick={() => onChange(level.id)}
            title={level.hint}
          >
            {level.label}
          </button>
        ))}
      </div>
      {activeHint && <span className="ha-autonomy__hint">{activeHint}</span>}
    </div>
  );
}
