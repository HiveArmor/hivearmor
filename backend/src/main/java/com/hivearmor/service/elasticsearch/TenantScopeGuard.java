package com.hivearmor.service.elasticsearch;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.web.rest.elasticsearch.TenantScopeViolationException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Shared tenant-scope guard extracted from {@code ElasticsearchResource} (B0-5) so that
 * every result-set query and export path enforces the SAME scope rule rather than each
 * controller re-implementing it. {@code ElasticsearchResource} and the forensic export
 * endpoints (B0-4) both delegate here.
 *
 * <p>Behaviour is identical to the original private {@code validateTenantScope} /
 * {@code isPatternInScope} in {@code ElasticsearchResource}: in non-MSSP mode (null
 * {@link TenantContext}) any pattern is allowed; in MSSP mode a pattern is in scope only
 * when it starts with the tenant's resolved alert or log prefix.
 */
@Component
@RequiredArgsConstructor
public class TenantScopeGuard {

    private final MsspIndexResolver indexResolver;

    /**
     * Validates that the requested index pattern is within the current tenant's scope.
     * Only enforced when MSSP mode is active (TenantContext has a non-null prefix).
     *
     * @param requestedPattern the client-supplied index pattern
     * @throws TenantScopeViolationException if the pattern is outside tenant scope
     */
    public void validate(String requestedPattern) {
        if (!TenantContext.isMssp()) {
            return;
        }
        if (!isPatternInScope(requestedPattern)) {
            throw new TenantScopeViolationException(requestedPattern);
        }
    }

    /**
     * Core scope check. Returns {@code true} when the requested index pattern is within the
     * active tenant's scope. Allowed patterns look like {@code v3-hive-<type>-<tenantPrefix>-*};
     * a pattern is in scope when it starts with the tenant's resolved alert or log prefix.
     *
     * @param requestedPattern the client-supplied index name/pattern; {@code null}/blank is out of scope
     * @return {@code true} iff the pattern is within the current tenant's scope
     */
    public boolean isPatternInScope(String requestedPattern) {
        if (requestedPattern == null || requestedPattern.isBlank()) {
            return false;
        }
        // resolveIndexPattern returns v3-hive-<type>-<prefix>-* ; strip the trailing wildcard.
        // The stripped prefix retains its trailing '-' (e.g. "v3-hive-alert-cwm-"), which is
        // what prevents a sibling-tenant collision such as tenant "cwm" matching "cwm2"
        // (the char after "cwm" is '2', not '-'). NOTE: this assumes tenant prefixes contain
        // no '-'; a hyphen-bearing prefix could still collide (documented constraint).
        String alertPrefix = indexResolver.resolveIndexPattern("alert").replace("*", "");
        String logPrefix = indexResolver.resolveIndexPattern("log").replace("*", "");

        // OpenSearch treats a comma-separated pattern as MULTI-TARGET, so a single
        // startsWith() on the whole string would let "v3-hive-alert-cwm-*,v3-hive-alert-other-*"
        // pass the scope check while still reading another tenant's index. Fail closed: split
        // on ',' and require EVERY sub-target to be in scope (an empty sub-target fails too).
        String[] targets = requestedPattern.trim().split(",", -1);
        for (String target : targets) {
            String trimmed = target.trim();
            if (trimmed.isEmpty()) {
                return false;
            }
            if (!(trimmed.startsWith(alertPrefix) || trimmed.startsWith(logPrefix))) {
                return false;
            }
        }
        return true;
    }
}
