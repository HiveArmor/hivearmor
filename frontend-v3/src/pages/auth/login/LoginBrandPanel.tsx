/**
 * LoginBrandPanel — HiveArmor identity + hero (presentation only).
 */

import { AgentStateIndicator } from './AgentStateIndicator';
import { HIVEARMOR_FULL_NAME } from './login.constants';

import { HaBrandLockup } from '@/components/ha-brand-lockup';

import './LoginBrandPanel.css';

export interface LoginBrandPanelProps {
  isPending?: boolean;
}

export function LoginBrandPanel({ isPending = false }: LoginBrandPanelProps): JSX.Element {
  return (
    <div className={`login-brand${isPending ? ' login-brand--pending' : ''}`}>
      <div className="login-brand__identity">
        <HaBrandLockup variant="lockup" size={56} />
        <p className="login-brand__full-name">{HIVEARMOR_FULL_NAME}</p>
        <div className="login-brand__accent" aria-hidden="true" />
      </div>

      <div className="login-brand__hero">
        <span className="login-brand__eyebrow">Hive Intelligence</span>
        <h2 className="login-brand__headline">
          <span className="login-brand__headline-line">Security operations that</span>
          <span className="login-brand__emphasis">think before they act.</span>
        </h2>
        <p className="login-brand__lede">
          Unified telemetry, autonomous investigation, and governed response.
        </p>
        <p className="login-brand__lede login-brand__lede--secondary">
          Built for modern security operations.
        </p>
        <AgentStateIndicator />
      </div>
    </div>
  );
}
