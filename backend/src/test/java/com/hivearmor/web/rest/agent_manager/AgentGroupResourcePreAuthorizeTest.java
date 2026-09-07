package com.hivearmor.web.rest.agent_manager;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Agent groups: SOC Manager may list/get; mutations remain Admin-only.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
class AgentGroupResourcePreAuthorizeTest {

    private static Method methodNamed(String name) {
        return Arrays.stream(AgentGroupResource.class.getDeclaredMethods())
            .filter(m -> m.getName().equals(name))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Missing method " + name));
    }

    @Test
    void classLevelAdminOnlyGuardRemoved() {
        PreAuthorize classPre = AgentGroupResource.class.getAnnotation(PreAuthorize.class);
        assertThat(classPre).isNull();
    }

    @Test
    void readsAllowAdminAndSocManager() {
        for (String name : List.of("listGroups", "getGroup")) {
            Method m = methodNamed(name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).doesNotContain("ROLE_ANALYST");
            assertThat(m.getAnnotation(GetMapping.class)).as(name).isNotNull();
        }
    }

    @Test
    void mutationsRemainAdminOnly() {
        for (String name : List.of(
            "createGroup", "updateGroup", "deleteGroup",
            "addMember", "removeMember", "setMembers"
        )) {
            Method m = methodNamed(name);
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(pre.value()).as(name).doesNotContain("ROLE_SOC_MANAGER");
            assertThat(pre.value()).as(name).doesNotContain("ROLE_ANALYST");
        }
    }
}
