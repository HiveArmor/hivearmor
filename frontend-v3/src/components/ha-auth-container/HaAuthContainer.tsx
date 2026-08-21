/**
 * HaAuthContainer
 * Full-page centred auth wrapper with card layout.
 */

import type { ReactNode } from 'react';
import './HaAuthContainer.css';

export interface HaAuthContainerProps {
  children: ReactNode;
  aside?: ReactNode;
  variant?: 'card' | 'split';
}

export function HaAuthContainer({ children, aside, variant = 'card' }: HaAuthContainerProps): JSX.Element {
  return (
    <div className="ha-auth-container" data-variant={variant}>
      <div className="ha-auth-workspace">
        {aside && <aside className="ha-auth-aside">{aside}</aside>}
        <main className="ha-auth-panel">
          <div className="ha-auth-card">{children}</div>
        </main>
      </div>
    </div>
  );
}
