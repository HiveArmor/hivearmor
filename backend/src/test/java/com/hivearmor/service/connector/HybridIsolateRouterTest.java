package com.hivearmor.service.connector;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("P2 hybrid response mesh — isolate router")
class HybridIsolateRouterTest {

    @Test
    void prefersHaAgentWhenEnrolledEvenIfVendorEnabled() {
        HybridIsolateRouter.Decision d = HybridIsolateRouter.resolve(true, true, true);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.HA_AGENT);
        assertThat(d.reason()).containsIgnoringCase("first-party");
    }

    @Test
    void prefersHaAgentWhenEnrolledAndVendorDisabled() {
        HybridIsolateRouter.Decision d = HybridIsolateRouter.resolve(true, false, false);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.HA_AGENT);
    }

    @Test
    void selectsVendorWhenNoAgentAndFlagAndCapability() {
        HybridIsolateRouter.Decision d = HybridIsolateRouter.resolve(false, true, true);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.VENDOR_CONNECTOR);
        assertThat(d.reason()).contains("ISOLATE_HOST");
    }

    @Test
    void unavailableWhenNoAgentAndVendorFlagOff() {
        HybridIsolateRouter.Decision d = HybridIsolateRouter.resolve(false, false, true);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.UNAVAILABLE);
        assertThat(d.reason()).contains("vendor-isolate-enabled=false");
    }

    @Test
    void unavailableWhenNoAgentFlagOnButNoCapability() {
        HybridIsolateRouter.Decision d = HybridIsolateRouter.resolve(false, true, false);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.UNAVAILABLE);
        assertThat(d.reason()).contains("ISOLATE_HOST");
    }
}
