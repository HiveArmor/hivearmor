/**
 * EntityPivotButtons — row of icon buttons for dossier, hunt, alerts, incidents navigation.
 * Each button navigates using the pivot route from the backend-signed pivot descriptors.
 */

import type { LucideProps } from 'lucide-react';
import { BookOpen, Crosshair, ShieldAlert, Siren } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { EntityPivot, PivotType } from '../types/entity.types';

import './EntityPivotButtons.css';

interface EntityPivotButtonsProps {
  pivots: EntityPivot[];
}

const PIVOT_ICONS: Record<PivotType, React.ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>>> = {
  dossier: BookOpen,
  hunt: Crosshair,
  alerts: ShieldAlert,
  incidents: Siren,
};

export function EntityPivotButtons({ pivots }: EntityPivotButtonsProps): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="ent-pivot-buttons" role="group" aria-label="Entity pivot navigation">
      {pivots.map((pivot) => {
        const Icon = PIVOT_ICONS[pivot.type];
        return (
          <button
            key={pivot.id}
            type="button"
            className="ent-pivot-buttons__btn"
            title={pivot.label}
            aria-label={pivot.label}
            onClick={() => {
              const route = pivot.route.startsWith('/')
                ? pivot.route
                : `/${pivot.route}`;
              navigate(route);
            }}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
