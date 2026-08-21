import { useEffect, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { HaAuthContainer } from '@/components/ha-auth-container';
import { HaButton } from '@/components/ha-button';
import { HaFormGroup } from '@/components/ha-form-group';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { HiveArmorLogo } from '@/components/ha-masthead/HiveArmorLogo';
import { useEnabledSsoProviders } from '@/hooks/useSsoProviders';
import { authenticate, getAccount } from '@/services/auth.service';
import { buildAuthorizeUrl } from '@/services/ssoService';
import { useAuthStore } from '@/store/auth.store';
import type { AuthenticateRequest } from '@/types/api.types';

import './LoginPage.css';

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((state) => state.setUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [serverError, setServerError] = useState('');
  const [securityNotice, setSecurityNotice] = useState('');
  const [showAllSso, setShowAllSso] = useState(false);
  const { data: ssoProviders, isLoading: ssoLoading, isError: ssoError } = useEnabledSsoProviders();

  useEffect(() => {
    // Bootstrap validates the stored token before this route renders. Redirect
    // only from authoritative auth state; a stale/fixture token in localStorage
    // must not bounce between /login and /dashboard while validation fails.
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setServerError('');
    setSecurityNotice('');
    if (params.get('locked') === 'true') {
      setServerError('Sign-in is temporarily unavailable. Contact your security administrator or try again later.');
    } else if (params.get('expired') === 'true') {
      setSecurityNotice('Your session expired. Sign in again to continue securely.');
    } else if (params.get('sso') === 'prompt') {
      setSecurityNotice('Choose your organization identity provider below, or continue with HiveArmor credentials.');
    }
  }, [location.search]);

  const mutation = useMutation({
    mutationFn: (request: AuthenticateRequest) => authenticate(request),
    onSuccess: async (response) => {
      setServerError('');
      const token = response.id_token || response.token;
      if (!token) {
        setServerError('Sign-in could not be completed. Please try again.');
        return;
      }
      if (response.tfaConfigured || response.forceTfa) {
        navigate('/login/tfa');
        return;
      }
      localStorage.setItem('hivearmor_auth_token', token);
      try {
        const account = await getAccount();
        setUser({
          id: account.id,
          login: account.login,
          firstName: account.firstName,
          lastName: account.lastName,
          email: account.email,
          roles: account.authorities,
          langKey: account.langKey,
          imageUrl: account.imageUrl,
        }, token);
      } catch {
        setUser({
          id: 0,
          login: username,
          firstName: '',
          lastName: '',
          email: '',
          roles: ['ROLE_USER'],
          langKey: 'en',
        }, token);
      }
      const from = (location.state as { from?: string })?.from || '/dashboard';
      navigate(from, { replace: true });
    },
    onError: (error: unknown) => {
      setPassword('');
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;
        if (status === 423) {
          navigate('/login?locked=true', { replace: true });
        } else if (status === 401) {
          setServerError('The credentials could not be verified. Check your details and try again.');
        } else {
          setServerError('HiveArmor authentication is temporarily unavailable. Please try again.');
        }
      } else {
        setServerError('Unable to reach HiveArmor. Check your secure network connection and try again.');
      }
    },
  });

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    setUsernameError('');
    setPasswordError('');
    setServerError('');
    let invalid = false;
    if (!username.trim()) {
      setUsernameError('Enter your work email or username.');
      invalid = true;
    }
    if (!password) {
      setPasswordError('Enter your password.');
      invalid = true;
    }
    if (!invalid) mutation.mutate({ username: username.trim(), password, rememberMe });
  };

  const brandPanel = (
    <div className="login-brand">
      <div className="login-brand__identity"><HiveArmorLogo size={42} /><span className="login-brand__name">HiveArmor</span></div>
      <div className="login-brand__copy">
        <span className="login-brand__eyebrow">Enterprise security operations</span>
        <h2>See the signal. Coordinate the response.</h2>
        <p>Hybrid Intelligence &amp; Visibility Engine for Advanced Response, Monitoring, Orchestration and Resilience.</p>
      </div>
      <div className="login-brand__signals" aria-label="Platform capabilities">
        <div className="login-brand__signal"><strong>Unified visibility</strong><span>Across tenants and telemetry</span></div>
        <div className="login-brand__signal"><strong>Analyst-led response</strong><span>Evidence before action</span></div>
        <div className="login-brand__signal"><strong>Operational resilience</strong><span>Health and risk in context</span></div>
      </div>
    </div>
  );

  return (
    <HaAuthContainer variant="split" aside={brandPanel}>
      <div className="login-form__identity"><HiveArmorLogo size={34} /><span>HiveArmor</span></div>
      <span className="login-form__eyebrow">Secure access</span>
      <h1 className="login-heading">Sign in to HiveArmor</h1>
      <p className="login-subtitle">Use your organization credentials to access the security operations workspace.</p>

      {securityNotice && <HaInlineBanner variant="info" description={securityNotice} isDismissible={false} />}
      {serverError && <HaInlineBanner variant={serverError.includes('credentials') ? 'danger' : 'warning'} description={serverError} isDismissible={false} />}

      <form className="login-form" onSubmit={handleSubmit} aria-label="Sign in" noValidate>
        <HaFormGroup label="Work email or username" isRequired fieldId="username">
          <input
            id="username"
            className="ha-text-input"
            type="text"
            aria-label="Work email or username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            aria-invalid={Boolean(usernameError)}
            aria-describedby={usernameError ? 'username-error' : undefined}
            disabled={mutation.isPending}
            maxLength={255}
          />
          {usernameError && <div id="username-error" className="field-error">{usernameError}</div>}
        </HaFormGroup>

        <HaFormGroup label="Password" isRequired fieldId="password">
          <div className="password-input-wrapper">
            <input
              id="password"
              className="ha-text-input"
              type={showPassword ? 'text' : 'password'}
              aria-label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? 'password-error' : undefined}
              disabled={mutation.isPending}
              maxLength={255}
            />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} disabled={mutation.isPending}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {passwordError && <div id="password-error" className="field-error">{passwordError}</div>}
        </HaFormGroup>

        <div className="login-form__utility">
          <label className="remember-me-label">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={mutation.isPending} />
            <span>Remember this device</span>
          </label>
          <button type="button" className="auth-link" onClick={() => setSecurityNotice('Password recovery is managed by your organization identity administrator or service desk.')} disabled={mutation.isPending}>Forgot password?</button>
        </div>

        <HaButton type="submit" variant="primary" isBlock isLoading={mutation.isPending} isDisabled={mutation.isPending} aria-busy={mutation.isPending}>
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </HaButton>
        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={() => navigate('/login?sso=prompt')} disabled={mutation.isPending}>Continue with organization SSO</button>
        </div>
      </form>

      {!ssoLoading && !ssoError && ssoProviders && ssoProviders.length > 0 && (
        <div className="sso-section">
          <div className="sso-divider" aria-hidden="true"><span className="sso-divider-label">Organization identity</span></div>
          {(showAllSso ? ssoProviders : ssoProviders.slice(0, 3)).map((provider) => (
            <button key={provider.id} type="button" className="sso-provider-button" onClick={() => { window.location.href = buildAuthorizeUrl(provider.id, `${window.location.origin}/oidc-callback`); }}>
              Continue with {provider.providerName}
            </button>
          ))}
          {ssoProviders.length > 3 && (
            <button
              type="button"
              className="auth-link sso-more"
              onClick={() => setShowAllSso((open) => !open)}
            >
              {showAllSso ? 'Show fewer identity providers' : `Show all ${ssoProviders.length} identity providers`}
            </button>
          )}
        </div>
      )}

      <div className="login-trust-row">
        <span className="login-system-status">Authentication service available</span>
        <span className="login-trust-mark"><ShieldCheck size={13} aria-hidden="true" />Protected enterprise access</span>
      </div>
    </HaAuthContainer>
  );
}
