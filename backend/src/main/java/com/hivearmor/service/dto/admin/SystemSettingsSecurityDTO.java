package com.hivearmor.service.dto.admin;

/**
 * DTO for the Security settings tab.
 *
 * <p>Carries session and authentication policy settings. None of these fields are
 * sensitive secrets, so no masking is required.
 */
public class SystemSettingsSecurityDTO {

    /** Idle session timeout in minutes; sessions older than this are invalidated. */
    private int sessionTimeoutMinutes;

    /** When {@code true}, all users must complete multi-factor authentication. */
    private boolean mfaRequired;

    /** Minimum password length enforced on password create/change operations. */
    private int passwordMinLength;

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public int getSessionTimeoutMinutes() {
        return sessionTimeoutMinutes;
    }

    public void setSessionTimeoutMinutes(int sessionTimeoutMinutes) {
        this.sessionTimeoutMinutes = sessionTimeoutMinutes;
    }

    public boolean isMfaRequired() {
        return mfaRequired;
    }

    public void setMfaRequired(boolean mfaRequired) {
        this.mfaRequired = mfaRequired;
    }

    public int getPasswordMinLength() {
        return passwordMinLength;
    }

    public void setPasswordMinLength(int passwordMinLength) {
        this.passwordMinLength = passwordMinLength;
    }
}
