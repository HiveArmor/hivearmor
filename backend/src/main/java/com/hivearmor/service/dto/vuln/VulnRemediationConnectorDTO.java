package com.hivearmor.service.dto.vuln;

/**
 * Static remediation connector catalog. Execute remains unavailable until a real connector is configured.
 */
public class VulnRemediationConnectorDTO {

    private String id;
    private String name;
    private String kind;
    private String state;
    private String note;

    public VulnRemediationConnectorDTO() {
    }

    public VulnRemediationConnectorDTO(String id, String name, String kind, String state, String note) {
        this.id = id;
        this.name = name;
        this.kind = kind;
        this.state = state;
        this.note = note;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
