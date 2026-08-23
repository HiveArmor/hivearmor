/**
 * LoginAuthPanel — focused authentication surface (presentation + form UI).
 * Auth mutation callbacks are passed in from LoginPage.
 */

import type { FormEvent, KeyboardEvent } from 'react';

import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

import { HIVEARMOR_FULL_NAME } from './login.constants';

import { HaBrandLockup } from '@/components/ha-brand-lockup';
import { HaFormGroup } from '@/components/ha-form-group';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import type { OidcProviderPublicDTO } from '@/types/sso';

import './LoginAuthPanel.css';

export interface LoginAuthPanelProps {
  username: string;
  password: string;
  showPassword: boolean;
  rememberMe: boolean;
  usernameError: string;
  passwordError: string;
  serverError: string;
  securityNotice: string;
  capsLockOn: boolean;
  isPending: boolean;
  selectedSsoId: string;
  productionProviders: OidcProviderPublicDTO[];
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onRememberMeChange: (value: boolean) => void;
  onForgotPassword: () => void;
  onSubmit: (event: FormEvent) => void;
  onPasswordKeyEvent: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelectedSsoChange: (value: string) => void;
  onSsoContinue: () => void;
}

export function LoginAuthPanel({
  username,
  password,
  showPassword,
  rememberMe,
  usernameError,
  passwordError,
  serverError,
  securityNotice,
  capsLockOn,
  isPending,
  selectedSsoId,
  productionProviders,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onRememberMeChange,
  onForgotPassword,
  onSubmit,
  onPasswordKeyEvent,
  onSelectedSsoChange,
  onSsoContinue,
}: LoginAuthPanelProps): JSX.Element {
  const hasSso = productionProviders.length > 0;
  const passwordDescribedBy = [
    passwordError ? 'password-error' : null,
    capsLockOn ? 'caps-lock-hint' : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="login-auth">
      <div className="login-auth__identity">
        <HaBrandLockup variant="mark" size={36} decorative />
        <div>
          <span className="login-auth__identity-name">HiveArmor</span>
          <p className="login-auth__identity-full">{HIVEARMOR_FULL_NAME}</p>
        </div>
      </div>

      <div className="login-auth__status">
        <span className="login-auth__status-dot" aria-hidden="true" />
        <span>Hive Online</span>
      </div>

      <span className="login-auth__eyebrow">Secure access</span>
      <h1 className="login-auth__heading">Sign in to HiveArmor</h1>
      <p className="login-auth__subtitle">Access your security operations workspace.</p>

      {securityNotice && <HaInlineBanner variant="info" description={securityNotice} isDismissible={false} />}
      {serverError && (
        <HaInlineBanner
          variant={serverError.includes('credentials') || serverError.includes('Unable to sign in') ? 'danger' : 'warning'}
          description={serverError}
          isDismissible={false}
        />
      )}

      <form className="login-auth__form" onSubmit={onSubmit} aria-label="Sign in" noValidate>
        <HaFormGroup label="Work email or username" isRequired fieldId="username">
          <input
            id="username"
            className="login-input"
            type="text"
            aria-label="Work email or username"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
            autoFocus
            aria-invalid={Boolean(usernameError)}
            aria-describedby={usernameError ? 'username-error' : undefined}
            disabled={isPending}
            maxLength={255}
          />
          {usernameError && (
            <div id="username-error" className="login-field-error" role="alert">
              {usernameError}
            </div>
          )}
        </HaFormGroup>

        <HaFormGroup label="Password" isRequired fieldId="password">
          <div className="login-password">
            <input
              id="password"
              className="login-input"
              type={showPassword ? 'text' : 'password'}
              aria-label="Password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              onKeyUp={onPasswordKeyEvent}
              onKeyDown={onPasswordKeyEvent}
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordDescribedBy}
              disabled={isPending}
              maxLength={255}
            />
            <button
              type="button"
              className="login-password__toggle"
              onClick={onTogglePassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
              disabled={isPending}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
          {capsLockOn && (
            <div id="caps-lock-hint" className="login-caps-hint">
              Caps Lock is on
            </div>
          )}
          {passwordError && (
            <div id="password-error" className="login-field-error" role="alert">
              {passwordError}
            </div>
          )}
        </HaFormGroup>

        <div className="login-auth__utility">
          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => onRememberMeChange(event.target.checked)}
              disabled={isPending}
            />
            <span>Remember me</span>
          </label>
          <button type="button" className="login-forgot" onClick={onForgotPassword} disabled={isPending}>
            Forgot password?
          </button>
        </div>

        <button type="submit" className="login-submit" disabled={isPending} aria-busy={isPending}>
          {isPending ? (
            <>
              <span className="login-submit__spinner" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {hasSso && (
        <div className="login-sso">
          <div className="login-sso__divider" aria-hidden="true">
            <span>or</span>
          </div>
          <HaFormGroup label="Organization identity" fieldId="sso-provider">
            <select
              id="sso-provider"
              className="login-input login-sso__select"
              value={selectedSsoId}
              onChange={(event) => onSelectedSsoChange(event.target.value)}
              disabled={isPending}
              aria-label="Organization identity provider"
            >
              <option value="">Select identity provider</option>
              {productionProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.providerName}
                </option>
              ))}
            </select>
          </HaFormGroup>
          <button
            type="button"
            className="login-sso__continue"
            onClick={onSsoContinue}
            disabled={isPending || !selectedSsoId}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            Continue with SSO
          </button>
        </div>
      )}

      <div className="login-auth__trust">
        <Lock size={13} aria-hidden="true" />
        <span>Secure encrypted connection</span>
      </div>

      <footer className="login-auth__footer">© 2026 HiveArmor. All rights reserved.</footer>
    </div>
  );
}
