/**
 * Admin notifications — delivery routing honesty hub (Prompt 44 / Wave C2 slice 2).
 *
 * Production inventory: GET /api/ha-notification-rules (ADMIN-gated).
 * Destination setup, governed routing and provider receipts remain fail-closed (INO-005–INO-007).
 */

import { NOTIFICATIONS_JOB_SENTENCE } from './adminNotifications.honesty';
import { IntegrationOperationsPage } from '../integration-operations/IntegrationOperationsPage';

export function AdminNotificationsPage(): JSX.Element {
  return (
    <IntegrationOperationsPage
      initialView="delivery"
      honestyChrome={{ jobSentence: NOTIFICATIONS_JOB_SENTENCE, variant: 'notifications' }}
    />
  );
}
