/** Bundle-visible job sentence — measured pipeline signals, not data-sources inventory or integrations. */
export const PIPELINE_SIGNALS_JOB_SENTENCE =
  'Pipeline & Ingestion operations — measured cluster soak history, OpenSearch/PostgreSQL store signals and consumer lag from GET /api/ha-pipeline-signals. Source inventory lives on Data Sources; parser configuration on Data Parsing — onboarding and governed replay stay fail-closed until ING contracts land.';

/** ING-002 — POST /api/ha-inputs/sources remains in-memory only. */
export const PIPELINE_SIGNALS_ONBOARD_FAIL_CLOSED_TITLE =
  'Source onboarding remains fail-closed until ING-002 durable POST /api/ha-inputs/sources lands';

/** ING-008 — governed quarantine/retry replay preview+confirm is not exposed. */
export const PIPELINE_SIGNALS_REPLAY_FAIL_CLOSED_TITLE =
  'Governed replay remains unavailable until ING-008 preview-then-confirm contracts land';
