package com.hivearmor.service.dto;

import java.util.List;

/**
 * Request body for the bulk quarantine action endpoint.
 *
 * Used by POST /api/ha-edr/quarantine/bulk.
 * Valid values for {@code action}: {@code "restore"}, {@code "delete"}.
 *
 * No Lombok — all accessors are explicit public methods.
 */
public class QuarantineBulkRequest {

    private List<Long> ids;
    private String action;

    // ---- getters / setters ----

    public List<Long> getIds() {
        return ids;
    }

    public void setIds(List<Long> ids) {
        this.ids = ids;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }
}
