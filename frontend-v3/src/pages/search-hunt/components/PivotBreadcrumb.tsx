import { ChevronRight } from 'lucide-react';

import type { HuntPivotConfig } from '../searchHunt.types';

/** One step in the investigation path: a scoped subset + the pivot config viewed at that depth. */
export interface PivotStep {
  id: string;
  /** Human label for the crumb (e.g. 'host.name = web01 × event.action = login'). Root uses 'All results'. */
  label: string;
  /** The pivot-local scope filters active at this step (empty at Root). */
  scopeFilters: string[];
  /** The pivot config (axes/measure) at this step. */
  config: HuntPivotConfig;
}

export interface PivotBreadcrumbProps {
  /** Root-first list of steps. steps[0] is the un-narrowed pivot; the last entry is the current depth. */
  steps: PivotStep[];
  /** Restore an earlier step (its scope + config); deeper steps are discarded. Not called for the current step. */
  onNavigate: (index: number) => void;
}

/**
 * Investigation breadcrumb (P1.1): the trail of Pivot Further steps. Clicking an earlier crumb restores
 * that step's scope + axes and truncates the deeper trail. The current (last) step is non-interactive.
 * Renders nothing at Root-only depth (a single step is not a path).
 */
export function PivotBreadcrumb({ steps, onNavigate }: PivotBreadcrumbProps): JSX.Element | null {
  if (steps.length <= 1) return null;
  const lastIndex = steps.length - 1;
  return (
    <nav className="pivot-breadcrumb" aria-label="Investigation path">
      {steps.map((step, i) => {
        const isCurrent = i === lastIndex;
        return (
          <span key={step.id} className="pivot-breadcrumb__item">
            {i > 0 && <ChevronRight size={12} aria-hidden="true" className="pivot-breadcrumb__sep" />}
            {isCurrent ? (
              <span className="pivot-breadcrumb__current" aria-current="step">{step.label}</span>
            ) : (
              <button
                type="button"
                className="pivot-breadcrumb__crumb"
                onClick={() => onNavigate(i)}
                title={`Back to ${step.label}`}
              >
                {step.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
