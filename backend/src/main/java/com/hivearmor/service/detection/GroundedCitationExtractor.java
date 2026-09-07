package com.hivearmor.service.detection;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DET-AI-002 (light) — extract grounded citations only from caller-supplied ids and
 * MITRE technique tokens already present in prompt/context/answer. Never invents
 * alert IDs or techniques that were not in the request or model text.
 *
 * <p>STAGING CANDIDATE.
 */
public final class GroundedCitationExtractor {

    private static final Pattern MITRE = Pattern.compile("\\bT\\d{4}(?:\\.\\d{3})?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ALERT_TOKEN = Pattern.compile(
        "\\balert(?:\\s+id)?\\s*[:=#]?\\s*([A-Za-z0-9][A-Za-z0-9._:-]{2,127})\\b",
        Pattern.CASE_INSENSITIVE
    );

    private GroundedCitationExtractor() {}

    public static List<String> extract(String alertId, String prompt, String context, String answer) {
        Set<String> citations = new LinkedHashSet<>();
        if (alertId != null && !alertId.isBlank()) {
            citations.add("alert:" + alertId.trim());
        }
        addAlertTokens(citations, prompt);
        addAlertTokens(citations, context);
        addMitre(citations, prompt);
        addMitre(citations, context);
        addMitre(citations, answer);
        return new ArrayList<>(citations);
    }

    public static List<String> fromAlertIds(List<String> alertIds, String... texts) {
        Set<String> citations = new LinkedHashSet<>();
        if (alertIds != null) {
            for (String id : alertIds) {
                if (id != null && !id.isBlank()) {
                    citations.add("alert:" + id.trim());
                }
            }
        }
        if (texts != null) {
            for (String text : texts) {
                addMitre(citations, text);
            }
        }
        return new ArrayList<>(citations);
    }

    private static void addAlertTokens(Set<String> citations, String text) {
        if (text == null || text.isBlank()) {
            return;
        }
        Matcher matcher = ALERT_TOKEN.matcher(text);
        while (matcher.find()) {
            citations.add("alert:" + matcher.group(1).trim());
        }
    }

    private static void addMitre(Set<String> citations, String text) {
        if (text == null || text.isBlank()) {
            return;
        }
        Matcher matcher = MITRE.matcher(text);
        while (matcher.find()) {
            citations.add("mitre:" + matcher.group().toUpperCase(Locale.ROOT));
        }
    }
}
