/** Bundle-visible job sentence — notification routing/delivery ops, not connector inventory or API keys. */
export const NOTIFICATIONS_JOB_SENTENCE =
  'Notifications operations — inventory delivery destinations and alert routing policy from GET /api/ha-notification-rules for Platform Administrators. Connector inventory lives on Integrations; service credentials on API Keys; ingestion health on Pipeline Signals — governed destination setup, provider receipts and simulated test dispatch remain fail-closed until INO-005–INO-007 land.';

export const NOTIFICATIONS_DELIVERY_FAIL_CLOSED_TITLE =
  'Destination setup and governed routing remain unavailable until INO-005–INO-007 publish versioned destination contracts, durable delivery jobs and authoritative provider receipts.';

/** Simulated notification test dispatch is not treated as delivered (INO-005). */
export const INO_NOTIFICATION_TEST_MOCK_LIVE = false;
