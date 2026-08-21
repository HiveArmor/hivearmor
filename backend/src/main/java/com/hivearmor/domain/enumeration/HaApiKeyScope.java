package com.hivearmor.domain.enumeration;

/**
 * Enumeration of permission scopes that can be assigned to a HiveArmor API key.
 *
 * <p>Scopes are persisted as comma-separated strings in
 * {@link com.hivearmor.domain.HaApiKey#getScopes()} and validated by
 * {@code HaApiKeyService.validateScopes()} before persistence.
 *
 * <p>The exact set of values is fixed by Requirement 6.1 and MUST NOT be
 * extended without a corresponding schema and API change.
 *
 * <ul>
 *   <li>{@link #read_alerts}    — read-only access to the alert stream</li>
 *   <li>{@link #write_alerts}   — ability to create/update alerts</li>
 *   <li>{@link #read_incidents} — read-only access to incidents</li>
 *   <li>{@link #read_logs}      — read-only access to raw log events</li>
 *   <li>{@link #manage_rules}   — create, update, and delete correlation rules</li>
 *   <li>{@link #admin}          — full administrative access (superset of all scopes)</li>
 * </ul>
 */
public enum HaApiKeyScope {

    /** Read-only access to the HiveArmor alert stream. */
    read_alerts,

    /** Permission to create and update alerts. */
    write_alerts,

    /** Read-only access to HiveArmor incidents. */
    read_incidents,

    /** Read-only access to raw log events indexed in OpenSearch. */
    read_logs,

    /** Permission to create, update, and delete correlation rules. */
    manage_rules,

    /** Full administrative access — superset of all other scopes. */
    admin
}
