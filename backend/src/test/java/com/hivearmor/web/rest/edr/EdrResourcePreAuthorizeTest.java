package com.hivearmor.web.rest.edr;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies legacy EdrResource containment mutates are role-gated (F03 / SensorGrid path).
 * SensorGrid isolate/kill call these JWT endpoints; backend then uses ProcessCommand
 * with INTERNAL_KEY on the gRPC hop only. Agent event ingest remains without method-level ROLE_*.
 */
class EdrResourcePreAuthorizeTest {

    private static final Set<Class<? extends Annotation>> MAPPINGS = Set.of(
        GetMapping.class, PostMapping.class, PutMapping.class, DeleteMapping.class, RequestMapping.class
    );

    private static List<Method> endpoints() {
        return Arrays.stream(EdrResource.class.getDeclaredMethods())
            .filter(m -> Arrays.stream(m.getAnnotations()).anyMatch(a -> MAPPINGS.contains(a.annotationType())))
            .collect(Collectors.toList());
    }

    @Test
    void containmentMutatesRequireAdminOrSocManager() {
        for (String name : List.of(
            "quarantineFile", "restoreFile", "isolateAgent", "liftIsolation", "killProcess",
            "createRule", "updateRule", "deleteRule"
        )) {
            Method m = Arrays.stream(EdrResource.class.getDeclaredMethods())
                .filter(x -> x.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing method " + name));
            PreAuthorize pre = m.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).as(name).contains("ROLE_ADMIN");
            assertThat(pre.value()).as(name).contains("ROLE_SOC_MANAGER");
        }
    }

    @Test
    void ingestEventIsNotRoleGatedAtMethodLevel() {
        Method m = Arrays.stream(EdrResource.class.getDeclaredMethods())
            .filter(x -> x.getName().equals("ingestEvent"))
            .findFirst()
            .orElseThrow();
        assertThat(m.getAnnotation(PreAuthorize.class))
            .as("ingestEvent must remain without ROLE_* PreAuthorize for agent ingest path")
            .isNull();
    }

    @Test
    void readEndpointsAreGated() {
        for (String name : List.of("listRules", "getRule", "queryEvents", "listQuarantine", "listIsolations")) {
            Method m = Arrays.stream(EdrResource.class.getDeclaredMethods())
                .filter(x -> x.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing method " + name));
            assertThat(m.getAnnotation(PreAuthorize.class)).as(name).isNotNull();
        }
    }
}
