package com.hivearmor.web.rest.compliance;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;

import java.lang.reflect.Method;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CMP-011 read + CMP-013 write — control-exception auth tier verification.
 */
class HaComplianceExceptionResourcePreAuthorizeTest {

    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_USER','ROLE_ANALYST','ROLE_SOC_MANAGER')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')";

    @Test
    void readEndpointUsesEvaluationHistoryTier() throws NoSuchMethodException {
        Method method = HaComplianceExceptionResource.class.getDeclaredMethod(
            "listByControl",
            Long.class,
            org.springframework.data.domain.Pageable.class
        );
        PreAuthorize pre = method.getAnnotation(PreAuthorize.class);
        assertThat(pre).isNotNull();
        assertThat(pre.value()).isEqualTo(READ_AUTH);
    }

    @Test
    void mutationEndpointsRequireAdminOrSocManager() {
        Map<String, String> expected = Map.of(
            "create", MUTATE_AUTH,
            "approve", MUTATE_AUTH,
            "reject", MUTATE_AUTH,
            "revoke", MUTATE_AUTH,
            "delete", MUTATE_AUTH
        );

        for (Method method : HaComplianceExceptionResource.class.getDeclaredMethods()) {
            String authKey = mutationKey(method);
            if (authKey == null) {
                continue;
            }
            PreAuthorize pre = method.getAnnotation(PreAuthorize.class);
            assertThat(pre).as(method.getName()).isNotNull();
            assertThat(pre.value()).isEqualTo(expected.get(authKey));
        }
    }

    @Test
    void classHasNoClassLevelPreAuthorize() {
        assertThat(HaComplianceExceptionResource.class.getAnnotation(PreAuthorize.class)).isNull();
    }

    private static String mutationKey(Method method) {
        if (method.getAnnotation(PostMapping.class) != null) {
            return "create";
        }
        if (method.getAnnotation(PatchMapping.class) != null) {
            return method.getName();
        }
        if (method.getAnnotation(DeleteMapping.class) != null) {
            return "delete";
        }
        return null;
    }
}
