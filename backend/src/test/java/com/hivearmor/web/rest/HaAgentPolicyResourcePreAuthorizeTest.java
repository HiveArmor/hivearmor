package com.hivearmor.web.rest;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies agent-policy PreAuthorize: Analyst read; Admin|SOC Manager mutate.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
class HaAgentPolicyResourcePreAuthorizeTest {

    private static Method methodNamed(Class<?> type, String name) {
        return Arrays.stream(type.getDeclaredMethods())
            .filter(m -> m.getName().equals(name))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing method " + name + " on " + type.getSimpleName()));
    }

    @Test
    void listAndEnforcementReadsAllowAnalyst() {
        for (String name : List.of("listPolicies", "getEnforcementEvidence")) {
            Method m = methodNamed(HaAgentPolicyResource.class, name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).contains("ROLE_ANALYST");
            assertThat(m.getAnnotation(GetMapping.class)).as(name).isNotNull();
        }
    }

    @Test
    void mutationsAllowAdminAndSocManagerOnly() {
        for (String name : List.of("createPolicy", "updatePolicy", "deletePolicy", "assignAgents")) {
            Method m = methodNamed(HaAgentPolicyResource.class, name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).doesNotContain("ROLE_ANALYST");
            assertThat(pre.value()).as(name).doesNotContain("ROLE_USER");
        }
    }
}
