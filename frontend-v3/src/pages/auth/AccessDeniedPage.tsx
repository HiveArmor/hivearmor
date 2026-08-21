/**
 * AccessDeniedPage — Full implementation
 * Shown when user attempts to access a resource they lack permissions for.
 */

import { ShieldX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { HaButton } from '@/components/ha-button';
import { useAuthStore } from '@/store/auth.store';

import './AccessDeniedPage.css';

export function AccessDeniedPage(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/command');
  };

  return (
    <div className="access-denied-page">
      <div className="access-denied-card">
        <div className="access-denied-icon">
          <ShieldX size={64} />
        </div>

        <h1 className="access-denied-heading">Access Denied</h1>

        <p className="access-denied-message">
          You do not have permission to view this resource.
          {user && (
            <>
              {' '}
              Your account (<strong>{user.login}</strong>) does not have the required role or privileges.
            </>
          )}
        </p>

        <p className="access-denied-submessage">
          If you believe you should have access, please contact your administrator.
        </p>

        <div className="access-denied-actions">
          <HaButton variant="secondary" onClick={handleGoBack}>
            Go Back
          </HaButton>
          <HaButton variant="primary" onClick={handleGoHome}>
            Go to Command Center
          </HaButton>
        </div>
      </div>
    </div>
  );
}
