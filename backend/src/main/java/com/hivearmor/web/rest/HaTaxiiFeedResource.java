package com.hivearmor.web.rest;

import com.hivearmor.domain.HiveTaxiiFeed;
import com.hivearmor.repository.HiveTaxiiFeedRepository;
import com.hivearmor.service.TaxiiClientService;
import com.hivearmor.service.dto.threat_intel.ThreatFeedSyncReceipt;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * HiveArmor REST controller for TAXII 2.1 feed management.
 *
 * All endpoints require ROLE_ADMIN authority.
 * API keys MUST NOT be accepted via URL query parameters (SEC-05).
 * Sync returns a thin {@link ThreatFeedSyncReceipt} (TI-004 STAGING CANDIDATE).
 * No Lombok — constructor injection only.
 */
@RestController
@RequestMapping("/api")
public class HaTaxiiFeedResource {

    private static final Logger log = LoggerFactory.getLogger(HaTaxiiFeedResource.class);

    private final HiveTaxiiFeedRepository feedRepository;
    private final TaxiiClientService taxiiClientService;

    public HaTaxiiFeedResource(HiveTaxiiFeedRepository feedRepository,
                                TaxiiClientService taxiiClientService) {
        this.feedRepository = feedRepository;
        this.taxiiClientService = taxiiClientService;
    }

    /**
     * GET /api/ha-threat-intel/taxii-feeds
     * Returns all configured TAXII feeds.
     */
    @GetMapping("/ha-threat-intel/taxii-feeds")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<HiveTaxiiFeed>> getAllTaxiiFeeds() {
        return ResponseEntity.ok(feedRepository.findAll());
    }

    /**
     * GET /api/ha-threat-intel/taxii-feeds/{id}
     * Returns a single TAXII feed by ID, or 404 if not found.
     */
    @GetMapping("/ha-threat-intel/taxii-feeds/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<HiveTaxiiFeed> getTaxiiFeed(@PathVariable Long id) {
        Optional<HiveTaxiiFeed> feed = feedRepository.findById(id);
        return feed.map(ResponseEntity::ok)
                   .orElse(ResponseEntity.notFound().build());
    }

    /**
     * POST /api/ha-threat-intel/taxii-feeds
     * Creates a new TAXII feed. Returns HTTP 201 with the created entity.
     */
    @PostMapping("/ha-threat-intel/taxii-feeds")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<HiveTaxiiFeed> createTaxiiFeed(@Valid @RequestBody HiveTaxiiFeed feed) {
        feed.setId(null); // prevent client-supplied ID
        HiveTaxiiFeed saved = feedRepository.save(feed);
        return ResponseEntity.created(URI.create("/api/ha-threat-intel/taxii-feeds/" + saved.getId()))
                             .body(saved);
    }

    /**
     * PUT /api/ha-threat-intel/taxii-feeds/{id}
     * Updates an existing TAXII feed, or returns 404 if not found.
     */
    @PutMapping("/ha-threat-intel/taxii-feeds/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<HiveTaxiiFeed> updateTaxiiFeed(@PathVariable Long id,
                                                          @Valid @RequestBody HiveTaxiiFeed feed) {
        if (!feedRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        feed.setId(id);
        HiveTaxiiFeed updated = feedRepository.save(feed);
        return ResponseEntity.ok(updated);
    }

    /**
     * DELETE /api/ha-threat-intel/taxii-feeds/{id}
     * Deletes a TAXII feed. Returns HTTP 204.
     */
    @DeleteMapping("/ha-threat-intel/taxii-feeds/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Void> deleteTaxiiFeed(@PathVariable Long id) {
        feedRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/ha-threat-intel/taxii/{feedId}/sync
     * Triggers a manual sync of a single TAXII feed.
     * Returns a thin sync receipt (receiptId, lastSyncAt, status, iocCount, failedReason).
     * Does not invent a durable job ledger. Failures are honest ERROR receipts — never
     * reported as a successful zero-IOC sync.
     */
    @PostMapping("/ha-threat-intel/taxii/{feedId}/sync")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ThreatFeedSyncReceipt> syncTaxiiFeed(@PathVariable Long feedId) {
        Optional<HiveTaxiiFeed> feedOpt = feedRepository.findById(feedId);
        if (feedOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        HiveTaxiiFeed feed = feedOpt.get();
        try {
            int count = taxiiClientService.pollCollection(feed);
            Instant at = feed.getLastSyncAt() != null ? feed.getLastSyncAt() : Instant.now();
            return ResponseEntity.ok(
                ThreatFeedSyncReceipt.ok(feedId, ThreatFeedSyncReceipt.SOURCE_TAXII, at, count)
            );
        } catch (Exception e) {
            log.warn("TAXII sync failed for feed {}: {}", feedId, e.getMessage());
            Instant failedAt = Instant.now();
            feed.setLastSyncAt(failedAt);
            feed.setLastSyncStatus(ThreatFeedSyncReceipt.STATUS_ERROR);
            feed.setLastSyncCount(0);
            feedRepository.save(feed);
            return ResponseEntity.ok(
                ThreatFeedSyncReceipt.error(
                    feedId,
                    ThreatFeedSyncReceipt.SOURCE_TAXII,
                    failedAt,
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()
                )
            );
        }
    }
}
