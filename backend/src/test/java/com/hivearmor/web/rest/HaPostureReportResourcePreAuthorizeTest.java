package com.hivearmor.web.rest;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure reflection guard (no Spring context) asserting every read endpoint on
 * {@link HaPostureReportResource} carries the analyst/admin/SOC-manager read tier and
 * that the class itself declares no class-level {@code @PreAuthorize}. Mirrors the
 * HaVuln/HaCisScan resource PreAuthorize tests.
 */
class HaPostureReportResourcePreAuthorizeTest {

    private static final String READ_AUTH =
            "hasAnyAuthority('ROLE_ANALYST', 'ROLE_ADMIN', 'ROLE_SOC_MANAGER')";

    private static final List<String> READ_ENDPOINTS = List.of(
            "getOverview", "getFleetCis", "getTrend",
            "exportPdf", "exportCisCsv", "exportVulnCsv");

    @Test
    void everyReadEndpointRequiresAnalystTier() throws NoSuchMethodException {
        for (String name : READ_ENDPOINTS) {
            Method method = findMethod(name);
            PreAuthorize annotation = method.getAnnotation(PreAuthorize.class);
            assertThat(annotation)
                    .as("%s must carry @PreAuthorize", name)
                    .isNotNull();
            assertThat(annotation.value())
                    .as("%s must use the analyst/admin/SOC-manager read tier", name)
                    .isEqualTo(READ_AUTH);
        }
    }

    @Test
    void readEndpointsUseGetMapping() throws NoSuchMethodException {
        for (String name : READ_ENDPOINTS) {
            assertThat(findMethod(name).getAnnotation(GetMapping.class))
                    .as("%s must be a GET", name)
                    .isNotNull();
        }
    }

    @Test
    void classHasNoClassLevelPreAuthorize() {
        assertThat(HaPostureReportResource.class.getAnnotation(PreAuthorize.class))
                .as("endpoint-scoped auth belongs on methods, not the class")
                .isNull();
    }

    @Test
    void everyPublicEndpointMethodIsGuarded() {
        // Defense in depth: no GET endpoint method may ship without @PreAuthorize,
        // so a future unlisted endpoint cannot silently pass the named-method checks.
        for (Method method : HaPostureReportResource.class.getDeclaredMethods()) {
            if (method.getAnnotation(GetMapping.class) != null) {
                assertThat(method.getAnnotation(PreAuthorize.class))
                        .as("%s is a GET endpoint and must carry @PreAuthorize", method.getName())
                        .isNotNull();
            }
        }
    }

    private Method findMethod(String name) throws NoSuchMethodException {
        for (Method method : HaPostureReportResource.class.getDeclaredMethods()) {
            if (method.getName().equals(name)) {
                return method;
            }
        }
        throw new NoSuchMethodException(name);
    }
}
