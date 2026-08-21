package com.hivearmor.service.dto.admin;

/**
 * Aggregate DTO returned by {@code GET /api/ha-admin/settings}.
 *
 * <p>Groups all four settings tabs into a single response object. Sensitive fields
 * within the nested DTOs are always masked (value {@code "***"}) before this object
 * is serialized and returned to callers (Req 3.2, 3.3).
 *
 * <p>Use {@link #masked()} to obtain a copy with all nested secrets masked.
 */
public class SystemSettingsDTO {

    private SystemSettingsGeneralDTO general;
    private SystemSettingsEmailDTO   email;
    private SystemSettingsAiDTO      ai;
    private SystemSettingsSecurityDTO security;

    // -------------------------------------------------------------------------
    // Factory helpers
    // -------------------------------------------------------------------------

    /**
     * Returns a copy of this DTO with all sensitive sub-fields replaced by
     * {@code "***"} so that the object is safe to serialize and return to API
     * callers (Req 3.2, 3.3).
     *
     * <p>Delegates masking to each nested DTO's own {@code masked()} method.
     * Sub-DTOs that have no sensitive fields (General, Security) are referenced
     * directly, while Email and AI are replaced by their masked copies.
     */
    public SystemSettingsDTO masked() {
        SystemSettingsDTO copy = new SystemSettingsDTO();
        copy.general  = this.general;   // no sensitive fields
        copy.email    = this.email    != null ? this.email.masked()    : null;
        copy.ai       = this.ai       != null ? this.ai.masked()       : null;
        copy.security = this.security;  // no sensitive fields
        return copy;
    }

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public SystemSettingsGeneralDTO getGeneral() {
        return general;
    }

    public void setGeneral(SystemSettingsGeneralDTO general) {
        this.general = general;
    }

    public SystemSettingsEmailDTO getEmail() {
        return email;
    }

    public void setEmail(SystemSettingsEmailDTO email) {
        this.email = email;
    }

    public SystemSettingsAiDTO getAi() {
        return ai;
    }

    public void setAi(SystemSettingsAiDTO ai) {
        this.ai = ai;
    }

    public SystemSettingsSecurityDTO getSecurity() {
        return security;
    }

    public void setSecurity(SystemSettingsSecurityDTO security) {
        this.security = security;
    }
}
