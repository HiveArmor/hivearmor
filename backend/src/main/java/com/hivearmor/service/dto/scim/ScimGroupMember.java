package com.hivearmor.service.dto.scim;

/**
 * SCIM 2.0 Group member sub-attribute — RFC 7643 §4.2.
 * {@code value} is the SCIM user id; {@code display} is a human-readable name.
 */
public class ScimGroupMember {

    private String value;
    private String display;

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public String getDisplay() {
        return display;
    }

    public void setDisplay(String display) {
        this.display = display;
    }
}
