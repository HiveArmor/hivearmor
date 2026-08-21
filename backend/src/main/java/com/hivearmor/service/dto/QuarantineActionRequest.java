package com.hivearmor.service.dto;

/**
 * Request body for the per-row quarantine action endpoint.
 *
 * Used by PATCH /api/ha-edr/quarantine/{id}.
 * Valid values for {@code action}: {@code "restore"}, {@code "delete"}.
 *
 * No Lombok — accessor is an explicit public method.
 */
public class QuarantineActionRequest {

    private String action;

    // ---- getter / setter ----

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }
}
