package com.hivearmor.web.rest;

import com.hivearmor.domain.HiveMispFeed;
import com.hivearmor.repository.HiveMispFeedRepository;
import com.hivearmor.service.MispConnectorService;
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
 * HiveArmor REST controller for MISP feed management.
 * All endpoints require ROLE_ADMIN authority.
 * API keys MUST NOT be accepted via URL query parameters (SEC-05).
 * Sync returns a thin {@link ThreatFeedSyncReceipt} (TI-004 STAGING CANDIDATE).
 * No Lombok — constructor injection only.
 */
@RestController
@RequestMapping("/api")
public class HaMispFeedResource {

    private static final Logger log = LoggerFactory.getLogger(HaMispFeedResource.class);

    private final HiveMispFeedRepository feedRepository;
    private final MispConnectorService mispConnectorService;

    public HaMispFeedResource(HiveMispFeedRepository feedRepository,
                               MispConnectorService mispConnectorService) {
        this.feedRepository = feedRepository;
        this.mispConnectorService = mispConnectorService;
    }

    @GetMapping("/ha-threat-intel/misp-feeds")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<HiveMispFeed>> getAllMispFeeds() {
        return ResponseEntity.ok(feedRepository.findAll());
    }

    @GetMapping("/ha-threat-intel/misp-feeds/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<HiveMispFeed> getMispFeed(@PathVariable Long id) {
        Optional<HiveMispFeed> feed = feedRepository.findById(id);
        return feed.map(ResponseEntity::ok)
                   .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/ha-threat-intel/misp-feeds")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<HiveMispFeed> createMispFeed(@Valid @RequestBody HiveMispFeed feed) {
        feed.setId(null);
        HiveMispFeed saved = feedRepository.save(feed);
        return ResponseEntity.created(URI.create("/api/ha-threat-intel/misp-feeds/" + saved.getId()))
                             .body(saved);
    }

    @PutMapping("/ha-threat-intel/misp-feeds/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<HiveMispFeed> updateMispFeed(@PathVariable Long id,
                                                        @Valid @RequestBody HiveMispFeed feed) {
        if (!feedRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        feed.setId(id);
        HiveMispFeed updated = feedRepository.save(feed);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/ha-threat-intel/misp-feeds/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Void> deleteMispFeed(@PathVariable Long id) {
        feedRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/ha-threat-intel/misp/{feedId}/sync
     * Thin sync receipt (TI-004). Failures persist {@code lastSyncStatus=ERROR} +
     * {@code lastSyncAt} so the Admin Status column stays honest after list refresh.
     * Not a durable job ledger. ROLE_ADMIN only.
     */
    @PostMapping("/ha-threat-intel/misp/{feedId}/sync")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ThreatFeedSyncReceipt> syncMispFeed(@PathVariable Long feedId) {
        Optional<HiveMispFeed> feedOpt = feedRepository.findById(feedId);
        if (feedOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        HiveMispFeed feed = feedOpt.get();
        try {
            int count = mispConnectorService.syncFeed(feed);
            Instant at = feed.getLastSyncAt() != null ? feed.getLastSyncAt() : Instant.now();
            return ResponseEntity.ok(
                ThreatFeedSyncReceipt.ok(feedId, ThreatFeedSyncReceipt.SOURCE_MISP, at, count)
            );
        } catch (Exception e) {
            log.warn("MISP sync failed for feed {}: {}", feedId, e.getMessage());
            Instant failedAt = Instant.now();
            feed.setLastSyncAt(failedAt);
            feed.setLastSyncStatus(ThreatFeedSyncReceipt.STATUS_ERROR);
            feed.setLastSyncCount(0);
            feedRepository.save(feed);
            return ResponseEntity.ok(
                ThreatFeedSyncReceipt.error(
                    feedId,
                    ThreatFeedSyncReceipt.SOURCE_MISP,
                    failedAt,
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()
                )
            );
        }
    }
}
