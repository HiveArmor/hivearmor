package com.hivearmor.service.dto;

import java.util.HashMap;
import java.util.Map;

/**
 * Optional body for {@code POST /api/ha-playbooks/{id}/execute}.
 *
 * <p>Carries runtime context so EDR/webhook steps can resolve targets without
 * hard-coding agent IDs into the saved playbook graph.
 */
public class PlaybookExecuteRequestDTO {

    /** Optional preview token from {@code POST .../preview} (accepted, not yet enforced). */
    private String previewToken;

    /** Alert id when execution is launched from an alert context. */
    private String alertId;

    /** Explicit agent id for EDR actions (preferred when known). */
    private String agentId;

    /** Hostname hint used when agentId is absent (logged for operators; not auto-resolved yet). */
    private String hostname;

    /** Free-form inputs merged into every action step's config (agentId, path, url, …). */
    private Map<String, Object> inputs = new HashMap<>();

    public String getPreviewToken() {
        return previewToken;
    }

    public void setPreviewToken(String previewToken) {
        this.previewToken = previewToken;
    }

    public String getAlertId() {
        return alertId;
    }

    public void setAlertId(String alertId) {
        this.alertId = alertId;
    }

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String agentId) {
        this.agentId = agentId;
    }

    public String getHostname() {
        return hostname;
    }

    public void setHostname(String hostname) {
        this.hostname = hostname;
    }

    public Map<String, Object> getInputs() {
        return inputs;
    }

    public void setInputs(Map<String, Object> inputs) {
        this.inputs = inputs != null ? inputs : new HashMap<>();
    }
}
