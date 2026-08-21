package com.hivearmor.service.dto.scim;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * SCIM 2.0 User resource — RFC 7643 §4.1.
 * Serialized with NON_NULL so absent optional fields are omitted from the response body.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ScimUser {

    private List<String> schemas = List.of("urn:ietf:params:scim:schemas:core:2.0:User");
    private String id;
    private String externalId;
    private String userName;
    private ScimName name;
    private List<ScimEmail> emails;
    private boolean active;
    private ScimMeta meta;

    public List<String> getSchemas() {
        return schemas;
    }

    public void setSchemas(List<String> schemas) {
        this.schemas = schemas;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getExternalId() {
        return externalId;
    }

    public void setExternalId(String externalId) {
        this.externalId = externalId;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public ScimName getName() {
        return name;
    }

    public void setName(ScimName name) {
        this.name = name;
    }

    public List<ScimEmail> getEmails() {
        return emails;
    }

    public void setEmails(List<ScimEmail> emails) {
        this.emails = emails;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public ScimMeta getMeta() {
        return meta;
    }

    public void setMeta(ScimMeta meta) {
        this.meta = meta;
    }
}
