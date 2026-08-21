package com.hivearmor.util;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link AlertUtil} verifying that index resolution is
 * correctly delegated to {@link MsspIndexResolver} and respects tenant context.
 *
 * <p><strong>Validates: Requirement 2.2</strong> — AlertUtil SHALL inject MsspIndexResolver
 * and replace alert index pattern lookups.
 *
 * <p>Correctness Properties:
 * <ul>
 *   <li>When TenantContext is set, getAlertIndex returns tenant-scoped pattern</li>
 *   <li>When TenantContext is null, getAlertIndex returns global pattern (backward compat)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AlertUtil — tenant-scoped and global index resolution")
class AlertUtilComponentTest {

    @Mock
    private ElasticsearchService elasticsearchService;

    private AlertUtil alertUtil;

    @BeforeEach
    void setUp() {
        // Use a real MsspIndexResolver — it has no external dependencies
        MsspIndexResolver indexResolver = new MsspIndexResolver();
        alertUtil = new AlertUtil(elasticsearchService, indexResolver);
    }

    /**
     * When TenantContext is set to "cwm", getAlertIndex must return the
     * tenant-scoped pattern "v3-hive-alert-cwm-*".
     */
    @Test
    @DisplayName("getAlertIndex with tenant 'cwm' → v3-hive-alert-cwm-*")
    void getAlertIndex_withTenantContext_returnsTenantScopedPattern() {
        try {
            TenantContext.set("cwm");
            String index = alertUtil.getAlertIndex();
            assertThat(index).isEqualTo("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * When TenantContext is null (no tenant scope), getAlertIndex must return
     * the global pattern "v3-hive-alert-*" — identical to legacy behavior.
     */
    @Test
    @DisplayName("getAlertIndex without tenant context → v3-hive-alert-*")
    void getAlertIndex_withoutTenantContext_returnsGlobalPattern() {
        // TenantContext is null by default (no set() called)
        String index = alertUtil.getAlertIndex();
        assertThat(index).isEqualTo("v3-hive-alert-*");
    }

    /**
     * When TenantContext is set to an empty/blank string, MsspIndexResolver
     * treats it as null and returns the global pattern.
     */
    @Test
    @DisplayName("getAlertIndex with blank tenant → v3-hive-alert-*")
    void getAlertIndex_withBlankTenantContext_returnsGlobalPattern() {
        try {
            TenantContext.set("   ");
            String index = alertUtil.getAlertIndex();
            assertThat(index).isEqualTo("v3-hive-alert-*");
        } finally {
            TenantContext.clear();
        }
    }
}
