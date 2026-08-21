package com.hivearmor.web.rest.errors;

/**
 * Thrown when a requested resource cannot be found within the current tenant scope.
 *
 * <p>The global exception handler maps this to a 404 RFC 7807 problem response
 * containing the resource type and ID.
 *
 * <p>Requirements: REQ-2 (HAR-002)
 */
public class HaResourceNotFoundException extends RuntimeException {

    private final String resourceType;
    private final String resourceId;

    /**
     * Creates a new resource-not-found exception.
     *
     * @param resourceType the type of resource (e.g., "alert", "incident", "entity")
     * @param resourceId   the identifier of the missing resource
     */
    public HaResourceNotFoundException(String resourceType, String resourceId) {
        super(capitalize(resourceType) + " with ID '" + resourceId + "' not found");
        this.resourceType = resourceType;
        this.resourceId = resourceId;
    }

    public String getResourceType() {
        return resourceType;
    }

    public String getResourceId() {
        return resourceId;
    }

    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
