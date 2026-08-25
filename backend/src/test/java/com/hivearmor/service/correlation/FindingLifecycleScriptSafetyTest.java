package com.hivearmor.service.correlation;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SEC-03 — finding lifecycle OpenSearch scripts must not embed free-form request input.
 */
class FindingLifecycleScriptSafetyTest {

    private static final Instant FIXED = Instant.parse("2026-08-25T02:00:00Z");

    @Test
    void statusUpdateScript_usesAllowlistedConstantsOnly() {
        assertThat(FindingLifecycleService.statusUpdateScript("reviewing", FIXED))
            .isEqualTo("ctx._source.status = 'reviewing'; ctx._source.updatedAt = '2026-08-25T02:00:00Z';");
        assertThat(FindingLifecycleService.statusUpdateScript("'; ctx._source.hacked=true; //", FIXED))
            .isNull();
        assertThat(FindingLifecycleService.statusUpdateScript("closed", FIXED)).isNull();
    }

    @Test
    void assigneeUpdateScript_rejectsUnsafeTokens() {
        assertThat(FindingLifecycleService.assigneeUpdateScript(null, FIXED))
            .isEqualTo("ctx._source.assignee = null; ctx._source.updatedAt = '2026-08-25T02:00:00Z';");
        assertThat(FindingLifecycleService.assigneeUpdateScript("analyst.jane", FIXED))
            .contains("ctx._source.assignee = 'analyst.jane'");
        assertThat(FindingLifecycleService.assigneeUpdateScript("'; ctx._source.x=1; //", FIXED))
            .isNull();
        assertThat(FindingLifecycleService.assigneeUpdateScript("bad'name", FIXED)).isNull();
    }
}
