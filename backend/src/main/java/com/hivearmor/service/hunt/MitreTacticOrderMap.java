package com.hivearmor.service.hunt;

import java.util.Map;

import org.springframework.stereotype.Component;

/**
 * Static kill-chain ordering constants for MITRE ATT&CK tactics.
 * Maps tactic IDs (TA0001–TA0043) to their position in the cyber kill-chain,
 * used for ordering attack story stages chronologically.
 */
@Component
public class MitreTacticOrderMap {

    private static final Map<String, Integer> TACTIC_ORDER = Map.ofEntries(
        Map.entry("TA0043", 1),   // Reconnaissance
        Map.entry("TA0042", 2),   // Resource Development
        Map.entry("TA0001", 3),   // Initial Access
        Map.entry("TA0002", 4),   // Execution
        Map.entry("TA0003", 5),   // Persistence
        Map.entry("TA0004", 6),   // Privilege Escalation
        Map.entry("TA0005", 7),   // Defense Evasion
        Map.entry("TA0006", 8),   // Credential Access
        Map.entry("TA0007", 9),   // Discovery
        Map.entry("TA0008", 10),  // Lateral Movement
        Map.entry("TA0009", 11),  // Collection
        Map.entry("TA0011", 12),  // Command and Control
        Map.entry("TA0010", 13),  // Exfiltration
        Map.entry("TA0040", 14)   // Impact
    );

    private static final int DEFAULT_ORDER = 99;

    /**
     * Returns the kill-chain order for the given MITRE tactic ID.
     *
     * @param tacticId the MITRE tactic ID (e.g. "TA0001")
     * @return the kill-chain position (1–14), or 99 for unknown tactics
     */
    public static int getOrder(String tacticId) {
        if (tacticId == null) {
            return DEFAULT_ORDER;
        }
        return TACTIC_ORDER.getOrDefault(tacticId, DEFAULT_ORDER);
    }
}
