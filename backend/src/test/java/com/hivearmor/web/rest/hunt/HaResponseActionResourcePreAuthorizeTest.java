package com.hivearmor.web.rest.hunt;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * F07 — response action catalog/execute must allow ROLE_ANALYST for investigation workspace.
 */
class HaResponseActionResourcePreAuthorizeTest {

    @Test
    void catalogAndMutatesAllowCanonicalAnalystRole() {
        for (String name : List.of("getActionCatalog", "previewAction", "executeAction", "getJobStatus")) {
            Method m = Arrays.stream(HaResponseActionResource.class.getDeclaredMethods())
                .filter(x -> x.getName().equals(name))
                .filter(x -> x.getAnnotation(GetMapping.class) != null || x.getAnnotation(PostMapping.class) != null)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing mapping method " + name));
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ANALYST");
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
        }
    }
}
