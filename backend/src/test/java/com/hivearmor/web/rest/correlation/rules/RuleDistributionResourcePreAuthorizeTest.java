package com.hivearmor.web.rest.correlation.rules;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * BE-POL-02 — rule push ACK allows agent device identity.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
class RuleDistributionResourcePreAuthorizeTest {

    private static Method methodNamed(String name) {
        return Arrays.stream(RuleDistributionResource.class.getDeclaredMethods())
            .filter(m -> m.getName().equals(name))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing method " + name));
    }

    @Test
    void acknowledgePushAllowsAdminSocManagerAndAgentDevice() {
        Method m = methodNamed("acknowledgePush");
        PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).contains("ROLE_ADMIN");
        assertThat(pre.value()).contains("ROLE_SOC_MANAGER");
        assertThat(pre.value()).contains("ROLE_AGENT_DEVICE");
        assertThat(pre.value()).doesNotContain("ROLE_ANALYST");
        PostMapping mapping = m.getAnnotation(PostMapping.class);
        assertThat(mapping).isNotNull();
        assertThat(mapping.value()).contains("/alert-response-rules/push-status/{ruleId}/ack");
    }

    @Test
    void operatorEndpointsAllowAnalyst() {
        for (String name : new String[]{"pushRuleToAgents", "getPushStatus"}) {
            Method m = methodNamed(name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ANALYST");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
        }
    }
}
