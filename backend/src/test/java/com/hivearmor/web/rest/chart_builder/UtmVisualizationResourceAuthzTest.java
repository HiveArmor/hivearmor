package com.hivearmor.web.rest.chart_builder;

import com.hivearmor.service.dto.visualization.UtmVisualizationDto;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SEC-06 authz contract for {@code POST /api/ha-visualizations/run}.
 *
 * <p>Standalone MockMvc does not activate method-security AOP, so HTTP 403 cannot be
 * asserted here without a full Spring Security context. This test locks the
 * {@code @PreAuthorize} expression that produces 403 for unauthorized callers at
 * runtime (same annotation-contract pattern as {@code HaScimAdminResourceTest}).
 */
class UtmVisualizationResourceAuthzTest {

    private static final String EXPECTED_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')";

    @Test
    void run_requiresAnalystTierPreAuthorize() throws NoSuchMethodException {
        Method run = UtmVisualizationResource.class.getDeclaredMethod(
            "run",
            UtmVisualizationDto.class,
            Integer.class,
            Integer.class,
            int.class
        );

        PostMapping mapping = run.getAnnotation(PostMapping.class);
        assertThat(mapping)
            .as("run() must map POST /ha-visualizations/run")
            .isNotNull();
        assertThat(mapping.value())
            .contains("/ha-visualizations/run");

        PreAuthorize preAuthorize = run.getAnnotation(PreAuthorize.class);
        assertThat(preAuthorize)
            .as("run() must carry @PreAuthorize (SEC-06)")
            .isNotNull();
        assertThat(preAuthorize.value())
            .as("@PreAuthorize on run() must match analyst-tier query execution roles")
            .isEqualTo(EXPECTED_AUTH);
    }
}
