package com.hivearmor.web.rest.hunt;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * F07 — severity board must accept ROLE_ANALYST (canonical) as well as legacy ROLE_SOC_ANALYST.
 */
class HaSeverityBoardResourcePreAuthorizeTest {

    @Test
    void getSeverityBoardAllowsCanonicalAnalystRole() {
        Method m = Arrays.stream(HaSeverityBoardResource.class.getDeclaredMethods())
            .filter(x -> x.getName().equals("getSeverityBoard"))
            .filter(x -> x.getAnnotation(GetMapping.class) != null)
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing getSeverityBoard mapping"));
        PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).contains("ROLE_ANALYST");
        assertThat(pre.value()).contains("ROLE_ADMIN");
    }
}
