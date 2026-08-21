package com.hivearmor.web.rest;

import com.hivearmor.domain.HiveTaxiiFeed;
import com.hivearmor.repository.HiveTaxiiFeedRepository;
import com.hivearmor.service.TaxiiClientService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.Optional;

/**
 * HiveArmor REST controller for TAXII 2.1 feed management.
 *
 * All endpoints require ROLE_ADMIN authority.
 * API keys MUST NOT be accepted via URL query parameters (SEC-05).
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
     * Returns "Synced N IOCs" on success, or 404 if the feed is not found.
     * Returns "Synced 0 IOCs" when the remote TAXII server is unreachable.
     */
    @PostMapping("/ha-threat-intel/taxii/{feedId}/sync")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<String> syncTaxiiFeed(@PathVariable Long feedId) {
        Optional<HiveTaxiiFeed> feedOpt = feedRepository.findById(feedId);
        if (feedOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        try {
            int count = taxiiClientService.pollCollection(feedOpt.get());
            return ResponseEntity.ok("Synced " + count + " IOCs");
        } catch (Exception e) {
            log.warn("TAXII sync failed for feed {}: {}", feedId, e.getMessage());
            return ResponseEntity.ok("Synced 0 IOCs");
        }
    }
}
