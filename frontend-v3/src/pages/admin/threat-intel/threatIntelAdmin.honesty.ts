/** Bundle-visible job sentence — feed source administration, not analyst workbench or legacy v1. */
export const THREAT_INTEL_ADMIN_JOB_SENTENCE =
  'Threat intelligence source administration — configure TAXII 2.1 and MISP feed ingestion for Platform Administrators. IOC lookup and analyst workbench live on Hive Intelligence; correlation enrichment uses ha-threat-intel lookup — scheduled sync jobs, TLP propagation to findings and legacy /v1/threat-intel cutover remain fail-closed until TI contracts land.';

/** TI-001 — scheduled background sync and governed IOC lifecycle automation are not durable jobs. */
export const THREAT_INTEL_SCHEDULED_SYNC_FAIL_CLOSED_TITLE =
  'Scheduled background feed sync and governed IOC lifecycle automation remain unavailable until TI-001 publishes durable job contracts.';

/** TI-003 — legacy v1 is hardened but deprecation/Sunset headers are not claimed. */
export const THREAT_INTEL_LEGACY_V1_CUTOVER_COMPLETE = false;
