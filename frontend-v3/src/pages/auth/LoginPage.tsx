/**
 * LoginPage — AUTH-01 authentication gate.
 * Auth logic stays here; brand/auth panels are presentation-only.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import { AgenticReasoningFabric } from './login/AgenticReasoningFabric';
import { LOGIN_CREDENTIALS_ERROR } from './login/login.constants';
import { LoginAuthPanel } from './login/LoginAuthPanel';
import { LoginBrandPanel } from './login/LoginBrandPanel';

import { HaAuthContainer } from '@/components/ha-auth-container';
import { useEnabledSsoProviders } from '@/hooks/useSsoProviders';
import { filterProductionSsoProviders } from '@/lib/ssoProviders';
import { authenticate, getAccount } from '@/services/auth.service';
import { buildAuthorizeUrl } from '@/services/ssoService';
import { useAuthStore } from '@/store/auth.store';
import type { AuthenticateRequest } from '@/types/api.types';

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
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [selectedSsoId, setSelectedSsoId] = useState('');
  const { data: ssoProviders, isLoading: ssoLoading, isError: ssoError } = useEnabledSsoProviders();

  const productionProviders = useMemo(
    () => filterProductionSsoProviders(ssoProviders),
    [ssoProviders],
  );

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (productionProviders.length === 1) {
      setSelectedSsoId(String(productionProviders[0].id));
    }
  }, [productionProviders]);

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
    } else if (params.get('error') === 'oidc_callback_failed') {
      setServerError('Organization sign-in could not be completed. Try again or use HiveArmor credentials.');
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
          setServerError(LOGIN_CREDENTIALS_ERROR);
        } else {
          setServerError('HiveArmor authentication is temporarily unavailable. Please try again.');
        }
      } else {
        setServerError('Unable to reach HiveArmor. Check your secure network connection and try again.');
      }
    },
  });

  const handleSubmit = (event: FormEvent): void => {
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

  const handlePasswordKeyEvent = (event: KeyboardEvent<HTMLInputElement>): void => {
    setCapsLockOn(event.getModifierState('CapsLock'));
  };

  const handleSsoContinue = (): void => {
    const providerId = Number(selectedSsoId);
    if (!Number.isFinite(providerId) || providerId <= 0) {
      setSecurityNotice('Select your organization identity provider to continue.');
      return;
    }
    window.location.href = buildAuthorizeUrl(providerId, `${window.location.origin}/oidc-callback`);
  };

  return (
    <HaAuthContainer
      variant="fullscreen"
      atmosphere={<AgenticReasoningFabric />}
      aside={<LoginBrandPanel isPending={mutation.isPending} />}
    >
      <LoginAuthPanel
        username={username}
        password={password}
        showPassword={showPassword}
        rememberMe={rememberMe}
        usernameError={usernameError}
        passwordError={passwordError}
        serverError={serverError}
        securityNotice={securityNotice}
        capsLockOn={capsLockOn}
        isPending={mutation.isPending}
        selectedSsoId={selectedSsoId}
        productionProviders={ssoLoading || ssoError ? [] : productionProviders}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onTogglePassword={() => setShowPassword((visible) => !visible)}
        onRememberMeChange={setRememberMe}
        onForgotPassword={() =>
          setSecurityNotice(
            'Password recovery is managed by your organization identity administrator or service desk.',
          )
        }
        onSubmit={handleSubmit}
        onPasswordKeyEvent={handlePasswordKeyEvent}
        onSelectedSsoChange={setSelectedSsoId}
        onSsoContinue={handleSsoContinue}
      />
    </HaAuthContainer>
  );
}
