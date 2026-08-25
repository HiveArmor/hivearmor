package com.hivearmor.service.connector;

import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.impl.AzureDefenderConnector;
import com.hivearmor.service.connector.impl.CrowdStrikeConnector;
import com.hivearmor.service.connector.impl.OktaConnector;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("P2 hybrid response mesh — dispatcher (no live vendor calls)")
class HybridResponseMeshDispatcherTest {

    @Test
    void planIsolatePrefersHaAgent() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(true),
            true
        );
        HybridIsolateRouter.Decision d = mesh.planIsolate(true);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.HA_AGENT);
    }

    @Test
    void planIsolateFallsBackToVendorWhenFlagOn() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(true),
            true
        );
        assertThat(mesh.anyVendorDeclaresIsolate()).isTrue();
        HybridIsolateRouter.Decision d = mesh.planIsolate(false);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.VENDOR_CONNECTOR);
    }

    @Test
    void planIsolateUnavailableWhenVendorFlagOff() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(true),
            false
        );
        // Registry may still advertise ISOLATE_HOST when constructed with true,
        // but dispatcher flag governs planning.
        HybridIsolateRouter.Decision d = mesh.planIsolate(false);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.UNAVAILABLE);
    }

    @Test
    void vendorIsolateDryRunDoesNotExecute() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(true),
            true
        );
        Map<String, Object> out = mesh.vendorIsolateDryRun(CrowdStrikeConnector.ID, "host-1");
        assertThat(out.get("executed")).isEqualTo(false);
        assertThat(out.get("persisted")).isEqualTo(false);
        assertThat(out.get("status")).isEqualTo("planned");
        assertThat(out.get("path")).isEqualTo(HybridIsolateRouter.Path.VENDOR_CONNECTOR.name());
        assertThat(out.get("connectorId")).isEqualTo(CrowdStrikeConnector.ID);
        assertThat(out.get("hostname")).isEqualTo("host-1");
        assertThat(String.valueOf(out.get("note"))).contains("STAGING CANDIDATE");
    }

    @Test
    void vendorIsolateDryRunRefusesWhenFlagOff() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(false),
            false
        );
        assertThatThrownBy(() -> mesh.vendorIsolateDryRun(null, null))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("vendor-isolate-enabled=false");
    }

    @Test
    void vendorIsolateDryRunRejectsConnectorWithoutIsolate() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(true),
            true
        );
        assertThatThrownBy(() -> mesh.vendorIsolateDryRun(OktaConnector.ID, null))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ISOLATE_HOST");
    }

    @Test
    void vendorIsolateDryRunAcceptsAzureDefenderWhenFlagged() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(true),
            true
        );
        Map<String, Object> out = mesh.vendorIsolateDryRun(AzureDefenderConnector.ID, "win-defender-host");
        assertThat(out.get("executed")).isEqualTo(false);
        assertThat(out.get("connectorId")).isEqualTo(AzureDefenderConnector.ID);
        assertThat(out.get("hostname")).isEqualTo("win-defender-host");
        assertThat(String.valueOf(out.get("note"))).containsIgnoringCase("STAGING");
    }

    @Test
    void planIsolateStillPrefersHaAgentWhenDefenderDeclaresIsolate() {
        HybridResponseMeshDispatcher mesh = new HybridResponseMeshDispatcher(
            new HaConnectorRegistry(true),
            true
        );
        assertThat(mesh.anyVendorDeclaresIsolate()).isTrue();
        assertThat(new HaConnectorRegistry(true).require(AzureDefenderConnector.ID).capabilities())
            .contains(ConnectorCapability.ISOLATE_HOST);
        HybridIsolateRouter.Decision d = mesh.planIsolate(true);
        assertThat(d.path()).isEqualTo(HybridIsolateRouter.Path.HA_AGENT);
    }

}
