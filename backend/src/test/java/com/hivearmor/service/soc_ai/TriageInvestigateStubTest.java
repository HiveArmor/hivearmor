package com.hivearmor.service.soc_ai;

import com.hivearmor.domain.shared_types.alert.UtmAlert;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for INVESTIGATE stub soft session linking + ALERT item pin (STAGING CANDIDATE).
 *
 * <p>Not PRODUCTION READY. Covers success, linker failure, pin soft-fail, unavailable linker,
 * and unresolved-alert skip paths. Never asserts Neo4j / attack-path claims.
 */
class TriageInvestigateStubTest {

    @Test
    void buildWithoutLinker_keepsStubHonestyAndSkipsSession() {
        Map<String, Object> investigate = TriageInvestigateStub.build(0);

        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("relatedAlertCount")).isEqualTo(0);
        assertThat(investigate.get("openHypotheses")).isEqualTo(List.of());
        assertThat(investigate.get("sessionLinked")).isEqualTo(false);
        assertThat(investigate).doesNotContainKey("sessionId");
        assertThat(investigate.get("note").toString())
            .contains("session link")
            .contains("no Neo4j");
        assertThat(TriageInvestigateStub.summarize(investigate))
            .contains("session link skipped")
            .contains("no Neo4j");
    }

    @Test
    void buildWithAlert_noLinker_relatedCountOne_noSessionId() {
        UtmAlert alert = new UtmAlert();
        alert.setId("a-1");
        alert.setName("Suspicious login");

        Map<String, Object> investigate = TriageInvestigateStub.build(alert);

        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("relatedAlertCount")).isEqualTo(1);
        assertThat(investigate.get("sessionLinked")).isEqualTo(false);
        assertThat(investigate).doesNotContainKey("sessionId");
    }

    @Test
    void buildWithLinker_success_recordsSessionIdAndStatus_keepsStubTrue() {
        UtmAlert alert = new UtmAlert();
        alert.setId("alert-42");
        alert.setName("Beaconing host");

        Map<String, Object> investigate = TriageInvestigateStub.build(
            alert,
            "alert-42",
            (name, description) -> {
                assertThat(name).isEqualTo("SOC-AI triage: Beaconing host");
                assertThat(description).contains("STAGING CANDIDATE").contains("No Neo4j");
                return new TriageInvestigateStub.LinkedSession(99L, "ACTIVE");
            });

        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("sessionLinked")).isEqualTo(true);
        assertThat(investigate.get("sessionId")).isEqualTo(99L);
        assertThat(investigate.get("sessionStatus")).isEqualTo("ACTIVE");
        assertThat(investigate.get("sessionItemPinned")).isEqualTo(false);
        assertThat(investigate.get("openHypotheses")).isEqualTo(List.of());
        assertThat(investigate.get("note").toString())
            .contains("soft investigation session link")
            .contains("no Neo4j")
            .doesNotContain("attack-path product");
        assertThat(TriageInvestigateStub.summarize(investigate))
            .contains("sessionId=99")
            .contains("sessionStatus=ACTIVE")
            .contains("sessionItemPinned=false")
            .contains("no Neo4j");
    }

    @Test
    void buildWithLinker_pinSuccess_recordsItemIdAndType_keepsStubTrue() {
        UtmAlert alert = new UtmAlert();
        alert.setId("alert-pin-ok");
        alert.setName("Credential dump");

        Map<String, Object> investigate = TriageInvestigateStub.build(
            alert,
            "alert-pin-ok",
            (name, description) -> new TriageInvestigateStub.LinkedSession(
                42L, "ACTIVE", true, 777L, "ALERT", null));

        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("sessionLinked")).isEqualTo(true);
        assertThat(investigate.get("sessionId")).isEqualTo(42L);
        assertThat(investigate.get("sessionItemPinned")).isEqualTo(true);
        assertThat(investigate.get("sessionItemId")).isEqualTo(777L);
        assertThat(investigate.get("sessionItemType")).isEqualTo("ALERT");
        assertThat(investigate).doesNotContainKey("sessionItemPinError");
        assertThat(TriageInvestigateStub.summarize(investigate))
            .contains("sessionItemId=777")
            .contains("sessionItemType=ALERT")
            .contains("no Neo4j");
    }

    @Test
    void buildWithLinker_pinFailure_keepsSessionLink_recordsSanitizedPinError() {
        UtmAlert alert = new UtmAlert();
        alert.setId("alert-pin-fail");
        alert.setName("Should not appear in pin error");

        Map<String, Object> investigate = TriageInvestigateStub.build(
            alert,
            "alert-pin-fail",
            (name, description) -> new TriageInvestigateStub.LinkedSession(
                88L,
                "ACTIVE",
                false,
                null,
                null,
                "pin_failed:IllegalStateException"));

        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("sessionLinked")).isEqualTo(true);
        assertThat(investigate.get("sessionId")).isEqualTo(88L);
        assertThat(investigate.get("sessionItemPinned")).isEqualTo(false);
        assertThat(investigate.get("sessionItemPinError"))
            .isEqualTo("pin_failed:IllegalStateException");
        assertThat(investigate.get("sessionItemPinError").toString())
            .doesNotContain("Should not appear");
        assertThat(TriageInvestigateStub.summarize(investigate))
            .contains("sessionId=88")
            .contains("sessionItemPinned=false")
            .contains("pin_failed:IllegalStateException")
            .doesNotContain("Should not appear");
    }

    @Test
    void buildWithLinker_usesAlertIdWhenNameBlank() {
        UtmAlert alert = new UtmAlert();
        alert.setId("id-only-7");

        Map<String, Object> investigate = TriageInvestigateStub.build(
            alert,
            "fallback-id",
            (name, description) -> {
                assertThat(name).isEqualTo("SOC-AI triage: id-only-7");
                return new TriageInvestigateStub.LinkedSession(7L, "ACTIVE");
            });

        assertThat(investigate.get("sessionId")).isEqualTo(7L);
        assertThat(investigate.get("stub")).isEqualTo(true);
    }

    @Test
    void buildWithLinker_failure_keepsStubTrue_recordsSanitizedError() {
        UtmAlert alert = new UtmAlert();
        alert.setId("alert-fail");
        alert.setName("Should not appear in error");

        Map<String, Object> investigate = TriageInvestigateStub.build(
            alert,
            "alert-fail",
            (name, description) -> {
                throw new IllegalStateException("db down for user should-not-log@example.com");
            });

        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("sessionLinked")).isEqualTo(false);
        assertThat(investigate).doesNotContainKey("sessionId");
        assertThat(investigate.get("sessionLinkError"))
            .isEqualTo("link_failed:IllegalStateException");
        assertThat(investigate.get("sessionLinkError").toString())
            .doesNotContain("example.com")
            .doesNotContain("Should not appear");
        assertThat(TriageInvestigateStub.summarize(investigate))
            .contains("sessionLinked=false")
            .contains("link_failed:IllegalStateException")
            .doesNotContain("example.com");
    }

    @Test
    void buildWithLinker_nullReturn_treatedAsUnavailable() {
        UtmAlert alert = new UtmAlert();
        alert.setId("alert-null-link");

        Map<String, Object> investigate = TriageInvestigateStub.build(
            alert, "alert-null-link", (name, description) -> null);

        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("sessionLinked")).isEqualTo(false);
        assertThat(investigate.get("sessionLinkError")).isEqualTo("linker returned no session");
        assertThat(investigate).doesNotContainKey("sessionId");
    }

    @Test
    void buildWhenAlertUnresolved_doesNotInvokeLinker() {
        AtomicInteger calls = new AtomicInteger();

        Map<String, Object> investigate = TriageInvestigateStub.build(
            null,
            "orphan-id",
            (name, description) -> {
                calls.incrementAndGet();
                return new TriageInvestigateStub.LinkedSession(1L, "ACTIVE");
            });

        assertThat(calls.get()).isZero();
        assertThat(investigate.get("relatedAlertCount")).isEqualTo(0);
        assertThat(investigate.get("sessionLinked")).isEqualTo(false);
        assertThat(investigate).doesNotContainKey("sessionId");
    }

    @Test
    void sessionTitle_truncatesToTwoHundredChars() {
        UtmAlert alert = new UtmAlert();
        alert.setName("x".repeat(250));

        String title = TriageInvestigateStub.sessionTitle(alert, null);
        assertThat(title).hasSize(200);
        assertThat(title).startsWith("SOC-AI triage: ");
    }

    @Test
    void sanitizeError_classNameOnly_noMessage() {
        assertThat(TriageInvestigateStub.sanitizeError(
                new RuntimeException("secret@example.com"), "pin_failed"))
            .isEqualTo("pin_failed:RuntimeException")
            .doesNotContain("example.com");
    }
}
