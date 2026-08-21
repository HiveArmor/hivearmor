package com.hivearmor.service.ueba;

import java.util.List;

/**
 * Abstraction over the source of active users for UEBA processing.
 *
 * <p>Implementations resolve the set of currently active users within a tenant,
 * including their Active Directory attributes and most recent source IP. The
 * resolution may involve querying OpenSearch (through {@code MsspIndexResolver}
 * and {@code SearchUtil} DSL) or an external identity source.
 *
 * <p>{@code HaUebaBaselineService} depends on this interface so that the
 * user-resolution strategy can be swapped or mocked independently of the
 * peer-group assignment logic.
 */
public interface ActiveUserDirectory {

    /**
     * Returns all active users for the given tenant.
     *
     * @param tenantId the tenant identifier to scope the lookup
     * @return list of active users — never null, may be empty
     */
    List<ActiveUser> listByTenant(String tenantId);
}
