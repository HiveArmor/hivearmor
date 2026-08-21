package com.hivearmor.web.rest;

import com.hivearmor.domain.HiveMispFeed;
import com.hivearmor.repository.HiveMispFeedRepository;
import com.hivearmor.service.MispConnectorService;
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
 * HiveArmor REST controller for MISP feed management.
 * All endpoints require ROLE_ADMIN authority.
 * API keys MUST NOT be accepted via URL query parameters (SEC-05).
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

    @PostMapping("/ha-threat-intel/misp/{feedId}/sync")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<String> syncMispFeed(@PathVariable Long feedId) {
        Optional<HiveMispFeed> feedOpt = feedRepository.findById(feedId);
        if (feedOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        int count = mispConnectorService.syncFeed(feedOpt.get());
        return ResponseEntity.ok("Synced " + count + " IOCs");
    }
}
