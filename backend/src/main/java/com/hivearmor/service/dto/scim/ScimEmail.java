package com.hivearmor.service.dto.scim;

/**
 * SCIM 2.0 Email multi-value sub-attribute — RFC 7643 §4.1.2.
 */
public class ScimEmail {

    private String value;
    private boolean primary;

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public boolean isPrimary() {
        return primary;
    }

    public void setPrimary(boolean primary) {
        this.primary = primary;
    }
}
