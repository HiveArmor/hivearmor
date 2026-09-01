/**
 * Pipeline & ingestion capability gates (Wave C2 / Prompt 41 — STAGING CANDIDATE honesty).
 */
export const PIPELINE_SIGNALS_API_LIVE = true;
export const PIPELINE_SOAK_24H_COMPLETE = false;
export const PIPELINE_REPLAY_GOVERNED = false;
export const PIPELINE_SOURCE_ONBOARD_DURABLE = false;
export const PIPELINE_NO_INVENTED_SLO_TITLE =
  'Measured signals only — host soak samples do not imply configured SLO pass/fail';
export const PIPELINE_REPLAY_FAIL_CLOSED_TITLE =
  'Governed replay remains unavailable until ING-008 preview-then-confirm contracts land';
