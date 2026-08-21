/** User identity menu shared by the compact navigation footer. */

import { useState } from 'react';

import { KeyRound, LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/store/auth.store';

import './UserAvatarMenu.css';

export interface UserAvatarMenuProps {
  compact?: boolean;
  placement?: 'top' | 'bottom';
}

export function UserAvatarMenu({ compact = false, placement = 'bottom' }: UserAvatarMenuProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const auth = useAuthStore();
  const user = auth.user;
  const logout = auth.logout;
  const navigate = useNavigate();

  if (!user) return <></>;

  const firstName = user.firstName?.trim() ?? '';
  const lastName = user.lastName?.trim() ?? '';
  const accountLabel = user.login?.trim() || user.email?.trim() || 'Account';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || accountLabel;
  const initials = [firstName, lastName]
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || accountLabel.slice(0, 2).toUpperCase();
  const close = (): void => setIsOpen(false);

  const handleSignOut = (): void => {
    close();
    logout();
    navigate('/login', { replace: true });
  };

  const goTo = (route: string): void => {
    close();
    navigate(route);
  };

  return (
    <div
      className="ha-user-menu"
      data-compact={compact}
      data-placement={placement}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <button
        className="ha-user-menu__trigger"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="ha-user-menu__avatar" aria-hidden="true">{initials}</span>
        <span className="ha-user-menu__identity">
          <strong>{accountLabel}</strong>
          <small>Account</small>
        </span>
      </button>

      {isOpen && (
        <>
          <button className="ha-user-menu__scrim" type="button" aria-label="Close user menu" onClick={close} />
          <div className="ha-user-menu__popover" role="menu" aria-label="Account actions">
            <div className="ha-user-menu__summary">
              <strong>{displayName}</strong>
              <span>{user.email}</span>
            </div>
            <button type="button" role="menuitem" onClick={() => goTo('/profile')}><User size={15} aria-hidden="true" />My Profile</button>
            <button type="button" role="menuitem" onClick={() => goTo('/account/change-password')}><KeyRound size={15} aria-hidden="true" />Change Password</button>
            <span className="ha-user-menu__separator" aria-hidden="true" />
            <button type="button" role="menuitem" data-tone="danger" onClick={handleSignOut}><LogOut size={15} aria-hidden="true" />Sign Out</button>
          </div>
        </>
      )}
    </div>
  );
}
