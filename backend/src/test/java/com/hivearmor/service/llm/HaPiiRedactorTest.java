package com.hivearmor.service.llm;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link HaPiiRedactor} (P1 LLM PII redaction — STAGING CANDIDATE).
 */
class HaPiiRedactorTest {

    private final HaPiiRedactor redactor = HaPiiRedactor.enabled();

    @Test
    void redactsEmailToStableToken() {
        String out = redactor.redact("Contact alice@corp.example about the alert");
        assertThat(out).isEqualTo("Contact [EMAIL_1] about the alert");
        assertThat(out).doesNotContain("alice@corp.example");
    }

    @Test
    void sameEmailSameTokenWithinSession() {
        HaPiiRedactor.Session session = new HaPiiRedactor.Session();
        String a = redactor.redact("from alice@corp.example", session);
        String b = redactor.redact("to Alice@Corp.Example", session);
        assertThat(a).contains("[EMAIL_1]");
        assertThat(b).contains("[EMAIL_1]");
        assertThat(a).doesNotContain("alice");
        assertThat(b).doesNotContain("Alice");
    }

    @Test
    void differentEmailsGetDistinctTokens() {
        String out = redactor.redact("a@x.com and b@y.org");
        assertThat(out).contains("[EMAIL_1]");
        assertThat(out).contains("[EMAIL_2]");
        assertThat(out).doesNotContain("@");
    }

    @Test
    void redactsIpv4() {
        String out = redactor.redact("src 10.0.0.5 dst 192.168.1.10");
        assertThat(out).isEqualTo("src [IP_1] dst [IP_2]");
    }

    @Test
    void sameIpSameTokenWithinSession() {
        HaPiiRedactor.Session session = new HaPiiRedactor.Session();
        assertThat(redactor.redact("hit 203.0.113.9", session)).contains("[IP_1]");
        assertThat(redactor.redact("again 203.0.113.9", session)).contains("[IP_1]");
    }

    @Test
    void redactsSsnLike() {
        String out = redactor.redact("ssn 123-45-6789 on file");
        assertThat(out).isEqualTo("ssn [SSN_1] on file");
    }

    @Test
    void redactsCreditCardLikeDigits() {
        String out = redactor.redact("pan 4111-1111-1111-1111 charged");
        assertThat(out).contains("[CC_1]");
        assertThat(out).doesNotContain("4111");
    }

    @Test
    void creditCardWithSpacesSharesTokenWithDashedForm() {
        HaPiiRedactor.Session session = new HaPiiRedactor.Session();
        String a = redactor.redact("4111 1111 1111 1111", session);
        String b = redactor.redact("4111-1111-1111-1111", session);
        assertThat(a).isEqualTo("[CC_1]");
        assertThat(b).isEqualTo("[CC_1]");
    }

    @Test
    void redactsHostnameWhenEnabled() {
        HaPiiRedactor withHost = HaPiiRedactor.enabledWithHostname();
        String out = withHost.redact("host evil.example.com beaconed");
        assertThat(out).contains("[HOST_1]");
        assertThat(out).doesNotContain("evil.example.com");
    }

    @Test
    void hostnameOffByDefaultAvoidsDottedDataTypeFalsePositive() {
        String out = redactor.redact("dataType windows.event from 10.0.0.1");
        assertThat(out).isEqualTo("dataType windows.event from [IP_1]");
        assertThat(out).doesNotContain("[HOST_");
    }

    @Test
    void emailNotDoubleTokenizedAsHostname() {
        HaPiiRedactor withHost = HaPiiRedactor.enabledWithHostname();
        String out = withHost.redact("mail user@mail.example.com");
        assertThat(out).isEqualTo("mail [EMAIL_1]");
        assertThat(out).doesNotContain("[HOST_");
    }

    @Test
    void disabledRedactorIsNoOp() {
        HaPiiRedactor off = HaPiiRedactor.disabled();
        String raw = "alice@corp.example 10.0.0.1 123-45-6789";
        assertThat(off.redact(raw)).isEqualTo(raw);
        assertThat(off.isEnabled()).isFalse();
    }

    @Test
    void nullAndEmptyPassThrough() {
        assertThat(redactor.redact(null)).isNull();
        assertThat(redactor.redact("")).isEmpty();
    }

    @Test
    void redactMessagesSharesSessionAcrossMessages() {
        List<ChatMessage> in = List.of(
            new ChatMessage("system", "Alert from 10.1.1.1"),
            new ChatMessage("user", "Also saw 10.1.1.1 and bob@x.com")
        );
        List<ChatMessage> out = redactor.redactMessages(in);
        assertThat(out).hasSize(2);
        assertThat(out.get(0).content()).isEqualTo("Alert from [IP_1]");
        assertThat(out.get(1).content()).isEqualTo("Also saw [IP_1] and [EMAIL_1]");
    }

    @Test
    void neverRequiresPromptBodyLogging() {
        // Guard: redactor has no Logger field and must not introduce prompt logging.
        assertThat(HaPiiRedactor.class.getDeclaredFields())
            .noneMatch(f -> f.getType().getName().contains("Logger"));
    }
}
