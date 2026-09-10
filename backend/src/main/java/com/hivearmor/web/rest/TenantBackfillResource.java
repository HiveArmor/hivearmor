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

    public TenantBackfillResource(TenantBackfillService backfillService) {
        this.backfillService = backfillService;
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
}
