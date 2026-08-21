package com.hivearmor.service.dto.scim;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * SCIM 2.0 Meta common attribute — RFC 7643 §3.1.
 * Timestamps are serialized as ISO-8601 strings.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ScimMeta {

    private String resourceType;
    private String created;
    private String lastModified;

    public String getResourceType() {
        return resourceType;
    }

    public void setResourceType(String resourceType) {
        this.resourceType = resourceType;
    }

    public String getCreated() {
        return created;
    }

    public void setCreated(String created) {
        this.created = created;
    }

    public String getLastModified() {
        return lastModified;
    }

    public void setLastModified(String lastModified) {
        this.lastModified = lastModified;
    }
}
