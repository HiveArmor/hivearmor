import { describe, expect, it } from 'vitest';

import {
  PIPELINE_NO_INVENTED_SLO_TITLE,
  PIPELINE_REPLAY_FAIL_CLOSED_TITLE,
  PIPELINE_REPLAY_GOVERNED,
  PIPELINE_SIGNALS_API_LIVE,
  PIPELINE_SOAK_24H_COMPLETE,
  PIPELINE_SOURCE_ONBOARD_DURABLE,
} from './pipeline.capabilities';

describe('pipeline.capabilities', () => {
  it('documents live measured signals without claiming 24h soak complete', () => {
    expect(PIPELINE_SIGNALS_API_LIVE).toBe(true);
    expect(PIPELINE_SOAK_24H_COMPLETE).toBe(false);
    expect(PIPELINE_NO_INVENTED_SLO_TITLE).toMatch(/SLO pass\/fail/i);
  });

  it('keeps governed replay and durable onboarding fail-closed', () => {
    expect(PIPELINE_REPLAY_GOVERNED).toBe(false);
    expect(PIPELINE_SOURCE_ONBOARD_DURABLE).toBe(false);
    expect(PIPELINE_REPLAY_FAIL_CLOSED_TITLE).toMatch(/ING-008/);
  });
});
