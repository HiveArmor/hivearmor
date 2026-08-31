package com.hivearmor.web.rest.compliance;

import com.hivearmor.domain.compliance.UtmComplianceReportSchedule;
import com.hivearmor.service.dto.compliance.UtmComplianceReportScheduleCriteria;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.Method;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CMP-009 read + CMP-014 write — compliance report schedule auth tier verification.
 */
class UtmComplianceReportScheduleResourcePreAuthorizeTest {

    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_USER','ROLE_ANALYST','ROLE_SOC_MANAGER')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')";

    @Test
    void readEndpointUsesEvaluationHistoryTier() throws NoSuchMethodException {
        Method method = UtmComplianceReportScheduleResource.class.getDeclaredMethod(
            "getAllUtmComplianceReportSchedules",
            UtmComplianceReportScheduleCriteria.class,
            Pageable.class
        );
        PreAuthorize pre = method.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).isEqualTo(READ_AUTH);
    }

    @Test
    void mutationEndpointsRequireAdminOrSocManager() {
        Map<String, String> expected = Map.of(
            "createUtmComplianceReportSchedule", MUTATE_AUTH,
            "updateUtmComplianceReportSchedule", MUTATE_AUTH,
            "deleteUtmComplianceReportSchedule", MUTATE_AUTH
        );

        for (Method method : UtmComplianceReportScheduleResource.class.getDeclaredMethods()) {
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
        assertThat(UtmComplianceReportScheduleResource.class.getAnnotation(PreAuthorize.class)).isNull();
    }

    @Test
    void writeMethodsUseExpectedHttpMappings() throws NoSuchMethodException {
        assertThat(
            UtmComplianceReportScheduleResource.class
                .getDeclaredMethod("createUtmComplianceReportSchedule", UtmComplianceReportSchedule.class)
                .getAnnotation(PostMapping.class)
        ).isNotNull();
        assertThat(
            UtmComplianceReportScheduleResource.class
                .getDeclaredMethod("updateUtmComplianceReportSchedule", UtmComplianceReportSchedule.class)
                .getAnnotation(PutMapping.class)
        ).isNotNull();
        assertThat(
            UtmComplianceReportScheduleResource.class
                .getDeclaredMethod("deleteUtmComplianceReportSchedule", Long.class)
                .getAnnotation(DeleteMapping.class)
        ).isNotNull();
    }
}
