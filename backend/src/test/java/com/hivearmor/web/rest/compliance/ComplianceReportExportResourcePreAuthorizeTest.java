package com.hivearmor.web.rest.compliance;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CMP-009 read + CMP-014 write — report snapshot auth tier verification.
 */
class ComplianceReportExportResourcePreAuthorizeTest {

    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_USER','ROLE_ANALYST','ROLE_SOC_MANAGER')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')";

    @Test
    void readEndpointsUseEvaluationHistoryTier() throws NoSuchMethodException {
        Method list = ComplianceReportExportResource.class.getDeclaredMethod(
            "listReports", int.class, int.class
        );
        Method export = ComplianceReportExportResource.class.getDeclaredMethod("exportPdf", Long.class);

        PreAuthorize listAuth = list.getAnnotation(PreAuthorize.class);
        PreAuthorize exportAuth = export.getAnnotation(PreAuthorize.class);

        assertThat(listAuth).isNotNull();
        assertThat(listAuth.value()).isEqualTo(READ_AUTH);
        assertThat(exportAuth).isNotNull();
        assertThat(exportAuth.value()).isEqualTo(READ_AUTH);
    }

    @Test
    void mutationEndpointsRequireAdminOrSocManager() {
        Map<String, String> expected = Map.of(
            "createReport", MUTATE_AUTH,
            "deleteReport", MUTATE_AUTH
        );

        for (Method method : ComplianceReportExportResource.class.getDeclaredMethods()) {
            String name = method.getName();
            if (!expected.containsKey(name)) {
                continue;
            }
            PreAuthorize pre = method.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(name).isNotNull();
            assertThat(pre.value()).isEqualTo(expected.get(name));
        }
    }

    @Test
    void classHasNoClassLevelPreAuthorize() {
        assertThat(ComplianceReportExportResource.class.getAnnotation(PreAuthorize.class)).isNull();
    }

    @Test
    void writeMethodsUsePostOrDeleteMapping() throws NoSuchMethodException {
        assertThat(
            ComplianceReportExportResource.class
                .getDeclaredMethod("createReport", Map.class)
                .getAnnotation(PostMapping.class)
        ).isNotNull();
        assertThat(
            ComplianceReportExportResource.class
                .getDeclaredMethod("deleteReport", Long.class)
                .getAnnotation(DeleteMapping.class)
        ).isNotNull();
    }
}
