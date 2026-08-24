package com.hivearmor.service.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Deterministic PII redaction / pseudonymization for outbound LLM prompt bodies
 * (P1 LLMOps — STAGING CANDIDATE).
 *
 * <p>Complements the HaAiChat alert/incident <em>field</em> whitelist by scrubbing
 * common SOC PII patterns that may still appear inside whitelisted values
 * (e.g. description, source, destination) or free-form analyst chat / NL queries.
 *
 * <p>Within a single {@link Session} (one LLM request), the same input value always
 * maps to the same token ({@code [EMAIL_1]}, {@code [IP_1]}, …). Different values
 * get distinct counters. Tokens are stable only within that session — not across
 * requests.
 *
 * <p><strong>Never log</strong> raw input or redacted prompt bodies from this class.
 * Callers must log only prompt ids / hashes / counts.
 *
 * <p>Disable via {@code hivearmor.llm.pii-redaction-enabled=false}
 * ({@code HIVEARMOR_LLM_PII_REDACTION_ENABLED}) for air-gap debug when needed.
 * Default is {@code true}.
 */
@Component
public class HaPiiRedactor {

    // Order matters: email before hostname; long digit runs (CC) before SSN.
    private static final Pattern EMAIL = Pattern.compile(
        "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b");

    private static final Pattern CREDIT_CARD = Pattern.compile(
        "\\b(?:\\d[ -]*?){13,19}\\b");

    private static final Pattern SSN = Pattern.compile(
        "\\b\\d{3}-\\d{2}-\\d{4}\\b");

    private static final Pattern IPV4 = Pattern.compile(
        "\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}"
            + "(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b");

    /**
     * Optional FQDN hostname (at least one dot). Applied after email so mailbox
     * domains are not double-tokenized as hostnames.
     */
    private static final Pattern HOSTNAME = Pattern.compile(
        "\\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+"
            + "[A-Za-z]{2,}\\b");

    private final boolean enabled;
    private final boolean hostnameEnabled;

    /**
     * Spring constructor — value redaction ON by default; hostname OFF (optional)
     * to avoid false positives on dotted SOC field values (e.g. {@code windows.event}).
     */
    public HaPiiRedactor(
            @Value("${hivearmor.llm.pii-redaction-enabled:true}") boolean enabled,
            @Value("${hivearmor.llm.pii-hostname-redaction-enabled:false}") boolean hostnameEnabled) {
        this.enabled = enabled;
        this.hostnameEnabled = hostnameEnabled;
    }

    /** Enabled redactor without hostname scrubbing (tests / non-Spring default). */
    public static HaPiiRedactor enabled() {
        return new HaPiiRedactor(true, false);
    }

    /** Enabled redactor including optional hostname scrubbing. */
    public static HaPiiRedactor enabledWithHostname() {
        return new HaPiiRedactor(true, true);
    }

    /** No-op redactor for air-gap debug and delegation tests. */
    public static HaPiiRedactor disabled() {
        return new HaPiiRedactor(false, false);
    }

    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Redacts {@code text} using a fresh session (stable tokens within this call only).
     */
    public String redact(String text) {
        return redact(text, new Session());
    }

    /**
     * Redacts {@code text} using the given session so repeated values across
     * multiple fields/messages in one LLM request share tokens.
     */
    public String redact(String text, Session session) {
        if (!enabled || text == null || text.isEmpty()) {
            return text;
        }
        Objects.requireNonNull(session, "session");
        String out = replaceAll(text, EMAIL, "EMAIL", session.emails, true);
        out = replaceCreditCards(out, session);
        out = replaceAll(out, SSN, "SSN", session.ssns, false);
        out = replaceAll(out, IPV4, "IP", session.ips, false);
        if (hostnameEnabled) {
            out = replaceAll(out, HOSTNAME, "HOST", session.hosts, true);
        }
        return out;
    }

    /**
     * Redacts every message content with a shared session for one outbound LLM call.
     */
    public List<ChatMessage> redactMessages(List<ChatMessage> messages) {
        if (!enabled || messages == null || messages.isEmpty()) {
            return messages;
        }
        Session session = new Session();
        List<ChatMessage> out = new ArrayList<>(messages.size());
        for (ChatMessage m : messages) {
            if (m == null) {
                continue;
            }
            out.add(new ChatMessage(m.role(), redact(m.content(), session)));
        }
        return List.copyOf(out);
    }

    /**
     * Redacts legacy {@link com.hivearmor.ai.ChatMessage} contents with a shared session.
     */
    public List<com.hivearmor.ai.ChatMessage> redactAiMessages(
            List<com.hivearmor.ai.ChatMessage> messages) {
        if (!enabled || messages == null || messages.isEmpty()) {
            return messages;
        }
        Session session = new Session();
        List<com.hivearmor.ai.ChatMessage> out = new ArrayList<>(messages.size());
        for (com.hivearmor.ai.ChatMessage m : messages) {
            if (m == null) {
                continue;
            }
            out.add(new com.hivearmor.ai.ChatMessage(m.getRole(), redact(m.getContent(), session)));
        }
        return List.copyOf(out);
    }

    private static String replaceAll(String input,
                                     Pattern pattern,
                                     String kind,
                                     Map<String, String> tokenMap,
                                     boolean caseInsensitiveKey) {
        Matcher matcher = pattern.matcher(input);
        StringBuilder sb = new StringBuilder(input.length());
        while (matcher.find()) {
            String raw = matcher.group();
            String key = caseInsensitiveKey ? raw.toLowerCase(Locale.ROOT) : raw;
            String token = tokenMap.computeIfAbsent(key,
                k -> "[" + kind + "_" + (tokenMap.size() + 1) + "]");
            matcher.appendReplacement(sb, Matcher.quoteReplacement(token));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * Credit-card-like digit runs: normalize separators for token stability, keep
     * only sequences with 13–19 digits (common PAN length).
     */
    private static String replaceCreditCards(String input, Session session) {
        Matcher matcher = CREDIT_CARD.matcher(input);
        StringBuilder sb = new StringBuilder(input.length());
        while (matcher.find()) {
            String raw = matcher.group();
            String digits = raw.replaceAll("[^0-9]", "");
            if (digits.length() < 13 || digits.length() > 19) {
                matcher.appendReplacement(sb, Matcher.quoteReplacement(raw));
                continue;
            }
            String token = session.cards.computeIfAbsent(digits,
                k -> "[CC_" + (session.cards.size() + 1) + "]");
            matcher.appendReplacement(sb, Matcher.quoteReplacement(token));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * Per-request token map. Create one session per outbound LLM call.
     */
    public static final class Session {
        private final Map<String, String> emails = new LinkedHashMap<>();
        private final Map<String, String> cards = new LinkedHashMap<>();
        private final Map<String, String> ssns = new LinkedHashMap<>();
        private final Map<String, String> ips = new LinkedHashMap<>();
        private final Map<String, String> hosts = new LinkedHashMap<>();
    }
}
