package com.hivearmor.web.rest.overview;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A1-OVW-01 — overview aggregates used by Mission Control must be queue-tier gated.
 */
class OverviewResourcePreAuthorizeTest {

    @Test
    void allOverviewGetMappingsRequireAlertQueueAuth() {
        Method[] methods = OverviewResource.class.getDeclaredMethods();
        long mapped = Arrays.stream(methods)
            .filter(m -> m.getAnnotation(GetMapping.class) != null)
            .count();
        assertThat(mapped).isGreaterThan(0);

        for (Method method : methods) {
            if (method.getAnnotation(GetMapping.class) == null) {
                continue;
            }
            PreAuthorize pre = method.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(method.getName()).isNotNull();
            assertThat(pre.value()).as(method.getName()).contains("ROLE_ANALYST");
            assertThat(pre.value()).as(method.getName()).contains("ROLE_SOC_ANALYST");
            assertThat(pre.value()).as(method.getName()).contains("ROLE_ADMIN");
        }
    }
}
