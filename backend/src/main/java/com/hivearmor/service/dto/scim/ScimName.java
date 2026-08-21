package com.hivearmor.service.dto.scim;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * SCIM 2.0 Name sub-attribute — RFC 7643 §4.1.1.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ScimName {

    private String formatted;
    private String givenName;
    private String familyName;

    public String getFormatted() {
        return formatted;
    }

    public void setFormatted(String formatted) {
        this.formatted = formatted;
    }

    public String getGivenName() {
        return givenName;
    }

    public void setGivenName(String givenName) {
        this.givenName = givenName;
    }

    public String getFamilyName() {
        return familyName;
    }

    public void setFamilyName(String familyName) {
        this.familyName = familyName;
    }
}
