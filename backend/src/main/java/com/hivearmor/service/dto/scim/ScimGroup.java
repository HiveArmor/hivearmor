package com.hivearmor.service.dto.scim;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * SCIM 2.0 Group resource — RFC 7643 §4.2.
 * Serialized with NON_NULL so absent optional fields are omitted from the response body.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ScimGroup {

    private List<String> schemas = List.of("urn:ietf:params:scim:schemas:core:2.0:Group");
    private String id;
    private String displayName;
    private List<ScimGroupMember> members;
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

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public List<ScimGroupMember> getMembers() {
        return members;
    }

    public void setMembers(List<ScimGroupMember> members) {
        this.members = members;
    }

    public ScimMeta getMeta() {
        return meta;
    }

    public void setMeta(ScimMeta meta) {
        this.meta = meta;
    }
}
