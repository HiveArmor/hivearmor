/**
 * NotificationsBell — Bell icon with unread count badge
 * Opens notifications drawer on click
 */

import { useState } from 'react';

import { Bell } from 'lucide-react';

export function NotificationsBell(): JSX.Element {
  const [unreadCount] = useState(0);

  const handleClick = (): void => {
    // TODO: Open notifications drawer (implementation in drawer component session)
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      aria-label="Notifications"
      className="ha-masthead-icon-button ha-notifications-button"
      data-unread={unreadCount > 0}
    >
      <Bell size={20} strokeWidth={2} />
      {unreadCount > 0 && (
        <span className="ha-notifications-button__badge">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
