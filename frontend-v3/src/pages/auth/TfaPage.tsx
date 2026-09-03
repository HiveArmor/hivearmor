/**
 * TfaPage — AUTH-02
 * Full implementation per .plan/frontend-v3-spec/screens/AUTH-02-mfa.md
 */

import { useEffect, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { HaAuthContainer } from '@/components/ha-auth-container';
import { HaBrandLockup } from '@/components/ha-brand-lockup';
import { HaButton } from '@/components/ha-button';
import { HaFormGroup } from '@/components/ha-form-group';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { HaStepper } from '@/components/ha-stepper';
import { getAccount, verifyTfaCode } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

import './TfaPage.css';

export function TfaPage(): JSX.Element {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [serverError, setServerError] = useState('');

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: (verifyCode: string) => verifyTfaCode(verifyCode),
    onSuccess: async (response) => {
      setServerError('');

      // Store token first so apiClient can attach it to the /account call
      const token = response.id_token ?? response.token ?? '';
      localStorage.setItem('hivearmor_auth_token', token);

      // Fetch the real user account to get roles
      try {
        const account = await getAccount();
        setUser(
          {
            id: account.id,
            login: account.login,
            firstName: account.firstName,
            lastName: account.lastName,
            email: account.email,
            roles: account.authorities,
            langKey: account.langKey,
            imageUrl: account.imageUrl,
          },
          token
        );
      } catch {
        setUser(
          { id: 0, login: '', firstName: '', lastName: '', email: '', roles: ['ROLE_USER'], langKey: 'en' },
          token
        );
      }

      navigate('/dashboard', { replace: true });
    },
    onError: (error: unknown) => {
      // Clear code on error
      setCode('');
      inputRef.current?.focus();

      if (error && typeof error === 'object' && 'status' in error) {
        const httpError = error as { status: number };
        if (httpError.status === 401) {
          setServerError('Invalid or expired code. Check your authenticator app and try again.');
        } else if (httpError.status === 423) {
          navigate('/login?locked=true');
        } else if (httpError.status === 500) {
          setServerError('An error occurred. Please try again.');
        } else {
          setServerError('An error occurred. Please try again.');
        }
      } else {
        // Network error
        setServerError('Unable to connect to HiveArmor. Check your network connection.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setCodeError('');
    setServerError('');

    // Client-side validation
    if (!code.trim() || code.length !== 6) {
      setCodeError('Enter your 6-digit code.');
      return;
    }

    // Verify code is numeric
    if (!/^\d{6}$/.test(code)) {
      setCodeError('Code must be 6 digits.');
      return;
    }

    mutation.mutate(code);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    setCodeError('');
    setServerError('');

    // Auto-submit when 6 digits are entered
    if (value.length === 6) {
      setTimeout(() => {
        mutation.mutate(value);
      }, 100);
    }
  };

  const handleCancel = () => {
    // Clear pre-verification JWT and return to login
    localStorage.removeItem('hivearmor_auth_token');
    navigate('/login', { replace: true });
  };

  const handleRetry = () => {
    setServerError('');
    if (code.length === 6) {
      mutation.mutate(code);
    }
  };

  return (
    <HaAuthContainer>
      <div className="tfa-identity">
        <HaBrandLockup variant="mark" size={40} decorative />
        <span className="tfa-identity__name">HiveArmor</span>
      </div>

      {/* Step indicator */}
      <HaStepper
        className="tfa-stepper"
        ariaLabel="Sign in: step 2 of 2"
        current={1}
        steps={[
          { id: 'auth', label: 'Authentication' },
          { id: 'verify', label: 'Verification' },
        ]}
      />

      <h1 className="tfa-heading">Two-factor authentication</h1>
      <p className="tfa-subtext">Enter the 6-digit code from your authenticator app.</p>

      {serverError && (
        <HaInlineBanner
          variant={serverError.includes('Unable to connect') ? 'warning' : 'danger'}
          description={serverError}
          isDismissible={false}
        />
      )}

      {serverError.includes('Unable to connect') && (
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <HaButton variant="secondary" onClick={handleRetry} size="sm">
            Retry
          </HaButton>
        </div>
      )}

      <form onSubmit={handleSubmit} aria-label="Two-factor authentication">
        <HaFormGroup
          label="Verification code"
          isRequired
          fieldId="tfa-code"
        >
          <input
            ref={inputRef}
            type="text"
            id="tfa-code"
            className="ha-text-input tfa-code-input"
            value={code}
            onChange={handleCodeChange}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            aria-required="true"
            aria-invalid={!!codeError}
            aria-describedby={codeError ? 'code-error' : undefined}
            disabled={mutation.isPending}
          />
          {codeError && (
            <div id="code-error" className="field-error">{codeError}</div>
          )}
        </HaFormGroup>

        <HaButton
          type="submit"
          variant="primary"
          isBlock
          isLoading={mutation.isPending}
          isDisabled={mutation.isPending || code.length !== 6}
          aria-label={mutation.isPending ? 'Verifying…' : 'Verify'}
          aria-busy={mutation.isPending}
        >
          {mutation.isPending ? 'Verifying…' : 'Verify'}
        </HaButton>

        <div className="tfa-footer">
          <button
            type="button"
            className="auth-link"
            onClick={() => navigate('/login/backup-code')}
            disabled={mutation.isPending}
          >
            Use a backup code
          </button>
          <span className="divider">|</span>
          <button
            type="button"
            className="auth-link"
            onClick={handleCancel}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
        </div>
      </form>
    </HaAuthContainer>
  );
}
