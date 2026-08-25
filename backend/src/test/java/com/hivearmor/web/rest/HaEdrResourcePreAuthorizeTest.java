package com.hivearmor.web.rest;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies endpoint quarantine / timeline / process-tree PreAuthorize expressions
 * align with navigation (Analyst, SOC Manager, Admin). Does not adopt legacy /api/edr/*.
 */
class HaEdrResourcePreAuthorizeTest {

    private static Method methodNamed(Class<?> type, String name) {
        return Arrays.stream(type.getDeclaredMethods())
            .filter(m -> m.getName().equals(name))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing method " + name + " on " + type.getSimpleName()));
    }

    @Test
    void quarantineListAndMutatesAllowSocManager() {
        for (String name : List.of(
            "listQuarantinedFiles", "applyQuarantineAction", "applyBulkQuarantineAction"
        )) {
            Method m = methodNamed(HaEdrResource.class, name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ANALYST");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
        }
        assertThat(methodNamed(HaEdrResource.class, "listQuarantinedFiles").getAnnotation(GetMapping.class)).isNotNull();
        assertThat(methodNamed(HaEdrResource.class, "applyQuarantineAction").getAnnotation(PatchMapping.class)).isNotNull();
        assertThat(methodNamed(HaEdrResource.class, "applyBulkQuarantineAction").getAnnotation(PostMapping.class)).isNotNull();
    }

    @Test
    void timelineAndProcessTreeAllowAnalystAndSocManager() {
        for (String name : List.of("getTimeline", "getProcessTree")) {
            Method m = methodNamed(HaEdrResource.class, name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(pre.value()).as(name).contains("ROLE_ANALYST");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).doesNotContain("ROLE_USER");
        }
    }

    @Test
    void fimSummaryAllowsSocManager() {
        Method m = methodNamed(HaEdrFimResource.class, "getFimSummary");
        PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).contains("ROLE_ANALYST");
        assertThat(pre.value()).contains("ROLE_SOC_MANAGER");
        assertThat(pre.value()).contains("ROLE_ADMIN");
        assertThat(m.getAnnotation(GetMapping.class)).isNotNull();
    }
}
