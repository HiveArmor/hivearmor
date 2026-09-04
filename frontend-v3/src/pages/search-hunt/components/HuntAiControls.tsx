import './HuntAiControls.css';

export type HuntAutonomy = 'off' | 'suggest' | 'auto-approve' | 'autopilot';

export interface HuntAiControlsProps {
  /** "Show AI's hand" — paints the provenance lens on model/enrichment fields (move 2). */
  showAiHand: boolean;
  onToggleAiHand: (next: boolean) => void;
  /** Autonomy level (move 4). Auto-approve/Autopilot are DISABLED until the response
   *  backend ships (propose-only, REDESIGN §5.2). */
  autonomy: HuntAutonomy;
  onAutonomyChange: (next: HuntAutonomy) => void;
}

const AUTONOMY_OPTIONS: { value: HuntAutonomy; label: string; enabled: boolean }[] = [
  { value: 'off', label: 'Off', enabled: true },
  { value: 'suggest', label: 'Suggest', enabled: true },
  { value: 'auto-approve', label: 'Auto-approve', enabled: false },
  { value: 'autopilot', label: 'Autopilot', enabled: false },
];

/**
 * AI controls for the hunt query workspace: the "Show AI's hand" provenance-lens
 * toggle and the propose-only autonomy dial. Both wear --ha-intelligence-primary.
 */
export function HuntAiControls({
  showAiHand,
  onToggleAiHand,
  autonomy,
  onAutonomyChange,
}: HuntAiControlsProps): JSX.Element {
  return (
    <div className="hunt-ai-controls">
      <button
        type="button"
        className={`hunt-ai-hand${showAiHand ? ' hunt-ai-hand--on' : ''}`}
        onClick={() => onToggleAiHand(!showAiHand)}
        aria-pressed={showAiHand}
        title="Highlight which result values the AI derived vs raw log"
      >
        <span className="hunt-ai-hand__glyph" aria-hidden="true">✦</span>
        Show AI&apos;s hand
      </button>

      <div
        className="hunt-autonomy"
        role="radiogroup"
        aria-label="Hunt agent autonomy (Auto-approve and Autopilot unlock when the response backend ships)"
      >
        <span className="hunt-autonomy__label" aria-hidden="true">✦ Autonomy</span>
        {AUTONOMY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={autonomy === opt.value}
            className={`hunt-autonomy__opt${autonomy === opt.value ? ' hunt-autonomy__opt--on' : ''}`}
            disabled={!opt.enabled}
            title={opt.enabled ? undefined : 'Propose-only — unlocks when the response backend ships'}
            onClick={() => opt.enabled && onAutonomyChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
