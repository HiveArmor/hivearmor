package com.hivearmor.service.dto.scim;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * SCIM 2.0 ListResponse envelope — RFC 7644 §3.4.2.
 *
 * <p>The {@code Resources} field is capitalized per the RFC spec. Jackson's
 * {@code @JsonProperty("Resources")} on the getter ensures correct serialization
 * regardless of the default camelCase strategy.</p>
 *
 * @param <T> the SCIM resource type contained in this list (e.g. {@link ScimUser})
 */
public class ScimListResponse<T> {

    private List<String> schemas = List.of("urn:ietf:params:scim:api:messages:2.0:ListResponse");
    private int totalResults;
    private int startIndex = 1;
    private int itemsPerPage;
    private List<T> resources;

    public List<String> getSchemas() {
        return schemas;
    }

    public void setSchemas(List<String> schemas) {
        this.schemas = schemas;
    }

    public int getTotalResults() {
        return totalResults;
    }

    public void setTotalResults(int totalResults) {
        this.totalResults = totalResults;
    }

    public int getStartIndex() {
        return startIndex;
    }

    public void setStartIndex(int startIndex) {
        this.startIndex = startIndex;
    }

    public int getItemsPerPage() {
        return itemsPerPage;
    }

    public void setItemsPerPage(int itemsPerPage) {
        this.itemsPerPage = itemsPerPage;
    }

    /**
     * Returns the resource collection.
     * Annotated with {@code @JsonProperty("Resources")} (capital R) per RFC 7644 §3.4.2.
     */
    @JsonProperty("Resources")
    public List<T> getResources() {
        return resources;
    }

    public void setResources(List<T> resources) {
        this.resources = resources;
    }
}
