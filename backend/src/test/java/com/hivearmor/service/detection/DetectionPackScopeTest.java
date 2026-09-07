package com.hivearmor.service.detection;

import org.junit.jupiter.api.Test;

import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DetectionPackScopeTest {

    @Test
    void platformContentIsVisibleToEveryCaller() {
        assertThat(DetectionPackScope.isVisible(null, null)).isTrue();
        assertThat(DetectionPackScope.isVisible(0L, null)).isTrue();
        assertThat(DetectionPackScope.isVisible(null, 1L)).isTrue();
        assertThat(DetectionPackScope.isVisible(0L, 2L)).isTrue();
    }

    @Test
    void tenantOwnedContentNeverLeaksToAnotherTenantOrPlatformScope() {
        assertThat(DetectionPackScope.isVisible(1L, 1L)).isTrue();
        assertThat(DetectionPackScope.isVisible(1L, 2L)).isFalse();
        assertThat(DetectionPackScope.isVisible(2L, 1L)).isFalse();
        assertThat(DetectionPackScope.isVisible(1L, null)).isFalse();
        assertThat(DetectionPackScope.isVisible(1L, 0L)).isFalse();
        assertThat(DetectionPackScope.isVisible(2L, 0L)).isFalse();
    }

    @Test
    void requireVisibleHidesForeignPacksAsNotFound() {
        DetectionPackScope.requireVisible(null, 2L);
        assertThatThrownBy(() -> DetectionPackScope.requireVisible(1L, 2L))
            .isInstanceOf(NoSuchElementException.class)
            .hasMessage("Detection content not found");
    }

    @Test
    void honestyStatesRestVisibleUntilTenantWorkdirsExist() {
        assertThat(DetectionPackScope.HONESTY)
            .contains("REST-visible")
            .contains("tenant_id IS NULL")
            .contains("$WORK_DIR/tenants/{id}/rules")
            .contains("not engine-enforced until then")
            .contains("v3-hive-<type>-YYYY.MM.DD");
    }

    @Test
    void createStampsPlatformOrOwningTenant() {
        assertThat(DetectionPackScope.stampNotNull(null)).isEqualTo(0L);
        assertThat(DetectionPackScope.stampNotNull(0L)).isEqualTo(0L);
        assertThat(DetectionPackScope.stampNotNull(7L)).isEqualTo(7L);
        assertThat(DetectionPackScope.stampNullable(null)).isNull();
        assertThat(DetectionPackScope.stampNullable(0L)).isNull();
        assertThat(DetectionPackScope.stampNullable(7L)).isEqualTo(7L);
    }
}
