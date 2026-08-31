package com.hivearmor.web.rest.compliance;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CMP-011 — control-exception read path must match evaluation-history auth tier.
 */
class HaComplianceExceptionResourcePreAuthorizeTest {

    private static final String EXPECTED_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_USER','ROLE_ANALYST','ROLE_SOC_MANAGER')";

    @Test
    void classLevelPreAuthorizeMatchesEvaluationHistoryTier() {
        PreAuthorize pre = HaComplianceExceptionResource.class.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).isEqualTo(EXPECTED_AUTH);
    }

    @Test
    void listByControlIsTheOnlyGetMapping() {
        Method[] methods = HaComplianceExceptionResource.class.getDeclaredMethods();
        long mapped = Arrays.stream(methods)
            .filter(m -> m.getAnnotation(GetMapping.class) != null)
            .count();
        assertThat(mapped).isEqualTo(1);
    }
}
