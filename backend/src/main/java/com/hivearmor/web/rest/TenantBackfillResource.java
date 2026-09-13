package com.hivearmor.web.rest;

import com.hivearmor.multitenancy.TenantBackfillService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * P0A2-B — one-shot admin trigger for the tenant_id backfill (prerequisite for NOT-NULL
 * + RLS). Idempotent and re-runnable; ADMIN-only. Returns per-table counts so an operator
 * can confirm zero remaining nulls (single-tenant) or review orphaned rows (MSSP) before
 * a later NOT-NULL changeset runs.
 */
@RestController
@RequestMapping("/api")
public class TenantBackfillResource {

    private final Logger log = LoggerFactory.getLogger(TenantBackfillResource.class);
    private final TenantBackfillService backfillService;
    private final com.hivearmor.service.uba.UbaSyncService ubaSyncService;

    public TenantBackfillResource(TenantBackfillService backfillService,
                                  com.hivearmor.service.uba.UbaSyncService ubaSyncService) {
        this.backfillService = backfillService;
        this.ubaSyncService = ubaSyncService;
    }

    /**
     * POST /api/ha-tenant-backfill — run the tenant_id backfill across all agent-linked
     * tables. ADMIN-only. Safe to re-run (only NULL rows are touched).
     */
    @PostMapping("/ha-tenant-backfill")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<TenantBackfillService.TableResult>> runBackfill() {
        log.info("P0A2-B tenant backfill triggered via /api/ha-tenant-backfill");
        List<TenantBackfillService.TableResult> results = backfillService.backfill();
        return ResponseEntity.ok(results);
    }

    /**
     * POST /api/ha-tenant-notnull — the FINAL, irreversible step: enforce tenant_id NOT NULL
     * on every tenant table that is provably clean (zero NULLs). ADMIN-only. Idempotent and
     * safe to re-run: a table that still has NULL rows is SKIPPED (reported, never defaulted)
     * so the operator can re-run the backfill and retry. Run this only AFTER the backfill
     * reports zero remaining nulls. This is application-level (not a Liquibase changeset)
     * because deferred-until-clean enforcement cannot be modelled by a MARK_RAN precondition.
     */
    @PostMapping("/ha-tenant-notnull")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<TenantBackfillService.EnforceResult>> enforceNotNull() {
        log.info("P0A2 tenant_id NOT-NULL enforcement triggered via /api/ha-tenant-notnull");
        List<TenantBackfillService.EnforceResult> results = backfillService.enforceNotNull();
        return ResponseEntity.ok(results);
    }

    /**
     * POST /api/ha-uba-resolve-legacy-tenants — resolve tenant_id for LEGACY MSSP UBA rows
     * (hive_uba_anomaly / hive_uba_entity_risk) that predate per-tenant sync and cannot be
     * agent-resolved. Each legacy anomaly is attributed to the tenant whose alert index owns
     * its originating alert; entity-risk rows inherit their entity's (unambiguous) tenant.
     * Zero/ambiguous matches stay NULL and are reported — never guessed. ADMIN-only,
     * idempotent (only touches tenant_id IS NULL). Run this before ha-tenant-notnull so the
     * UBA NOT-NULL constraint can engage on MSSP.
     */
    @PostMapping("/ha-uba-resolve-legacy-tenants")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<com.hivearmor.service.uba.UbaSyncService.LegacyUbaResolution> resolveLegacyUbaTenants() {
        log.info("P0A2 legacy-UBA tenant resolution triggered via /api/ha-uba-resolve-legacy-tenants");
        return ResponseEntity.ok(ubaSyncService.resolveLegacyUbaTenants());
    }
}
