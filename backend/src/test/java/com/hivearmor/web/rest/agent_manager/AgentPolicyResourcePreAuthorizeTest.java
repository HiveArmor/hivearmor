package com.hivearmor.web.rest.agent_manager;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Agent-manager policy API: Analyst read; Admin|SOC Manager mutate.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
class AgentPolicyResourcePreAuthorizeTest {

    private static Method methodNamed(String name) {
        return Arrays.stream(AgentPolicyResource.class.getDeclaredMethods())
            .filter(m -> m.getName().equals(name))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing method " + name));
    }

    @Test
    void classLevelAdminOnlyGuardRemoved() {
        PreAuthorize classPre = AgentPolicyResource.class.getAnnotation(PreAuthorize.class);
        assertThat(classPre).isNull();
    }

    @Test
    void readsAllowAnalystIncludingStates() {
        for (String name : List.of("listPolicies", "getPushLog", "getPolicyStates")) {
            Method m = methodNamed(name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ANALYST");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(m.getAnnotation(GetMapping.class)).as(name).isNotNull();
        }
    }

    @Test
    void getPolicyAllowsAgentDevice() {
        Method m = methodNamed("getPolicy");
        PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).contains("ROLE_AGENT_DEVICE");
        assertThat(pre.value()).contains("ROLE_ANALYST");
    }

    @Test
    void mutationsAllowAdminAndSocManager() {
        for (String name : List.of(
            "createPolicy", "updatePolicy", "deletePolicy",
            "assignGroup", "unassignGroup", "pushToGroup"
        )) {
            Method m = methodNamed(name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).doesNotContain("ROLE_ANALYST");
        }
    }

    @Test
    void reportStateAllowsAdminSocManagerAndAgentDevice() {
        Method m = methodNamed("reportState");
        PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).contains("ROLE_ADMIN");
        assertThat(pre.value()).contains("ROLE_SOC_MANAGER");
        assertThat(pre.value()).contains("ROLE_AGENT_DEVICE");
        assertThat(pre.value()).doesNotContain("ROLE_ANALYST");
    }
}
