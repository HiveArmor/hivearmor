package com.hivearmor.web.rest;

import com.hivearmor.domain.threat_intel.UtmIocIndicator;
import com.hivearmor.repository.threat_intel.UtmIocIndicatorRepository;
import com.hivearmor.repository.threat_intel.UtmThreatFeedRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.ThreatIntelLookupService;
import com.hivearmor.service.dto.TlpFilteredIocDTO;
import com.hivearmor.service.dto.threat_intel.IocResultDTO;
import com.hivearmor.service.dto.threat_intel.ThreatFeedDTO;
import com.hivearmor.service.threat_intel.ThreatIntelService;
import com.hivearmor.util.UtilPagination;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * REST controller — Threat Intelligence hub (P3 endpoints).
 *
 * Replaces the old /api/v1/threat-intel prefix with /api/ha-* per project conventions.
 * Feed list/get authorize Admin|User|Analyst|SOC Manager explicitly (TI-002 STAGING CANDIDATE).
 * Feed mutate/sync remain ROLE_ADMIN only. Lookup/IOC browse keep Admin|User|Analyst|SOC Manager.
 *
 * GET  /api/ha-threat-intel/feeds               — list all threat feeds
 * GET  /api/ha-threat-intel/feeds/{id}           — single feed detail
 * PUT  /api/ha-threat-intel/feeds/{id}           — enable/disable a feed
 * POST /api/ha-threat-intel/feeds/{id}/sync      — trigger feed sync
 * POST /api/ha-threat-intel/lookup               — IOC lookup (single value)
 * GET  /api/ha-threat-intel/iocs                 — paged IOC browser with search/filter
 */
@RestController
@RequestMapping("/api/ha-threat-intel")
public class HaThreatIntelResource {

    private static final Logger log = LoggerFactory.getLogger(HaThreatIntelResource.class);

    private final ThreatIntelService threatIntelService;
    private final UtmIocIndicatorRepository iocRepo;
    private final UtmThreatFeedRepository feedRepo;
    private final ThreatIntelLookupService threatIntelLookupService;

    public HaThreatIntelResource(ThreatIntelService threatIntelService,
                                  UtmIocIndicatorRepository iocRepo,
                                  UtmThreatFeedRepository feedRepo,
                                  ThreatIntelLookupService threatIntelLookupService) {
        this.threatIntelService = threatIntelService;
        this.iocRepo = iocRepo;
        this.feedRepo = feedRepo;
        this.threatIntelLookupService = threatIntelLookupService;
    }

    // ------------------------------------------------------------------
    // Feed management
    // ------------------------------------------------------------------

    /**
     * GET /api/ha-threat-intel/feeds
     */
    @GetMapping("/feeds")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
                  "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
    public ResponseEntity<List<ThreatFeedDTO>> listFeeds() {
        log.debug("GET /api/ha-threat-intel/feeds");
        return ResponseEntity.ok(threatIntelService.listFeeds());
    }

    /**
     * GET /api/ha-threat-intel/feeds/{id}
     */
    @GetMapping("/feeds/{id}")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
                  "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
    public ResponseEntity<ThreatFeedDTO> getFeed(@PathVariable("id") String id) {
        log.debug("GET /api/ha-threat-intel/feeds/{}", id);
        return feedRepo.findById(id)
            .map(f -> ResponseEntity.ok(new ThreatFeedDTO(f)))
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * PUT /api/ha-threat-intel/feeds/{id}
     * Body: { "enabled": true|false }
     */
    @PutMapping("/feeds/{id}")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<ThreatFeedDTO> updateFeed(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        log.debug("PUT /api/ha-threat-intel/feeds/{}", id);
        try {
            boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
            return ResponseEntity.ok(threatIntelService.toggleFeed(id, enabled));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * POST /api/ha-threat-intel/feeds/{id}/sync
     */
    @PostMapping("/feeds/{id}/sync")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<ThreatFeedDTO> syncFeed(@PathVariable("id") String id) {
        log.debug("POST /api/ha-threat-intel/feeds/{}/sync", id);
        try {
            return ResponseEntity.ok(threatIntelService.syncFeed(id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ------------------------------------------------------------------
    // IOC lookup — single value enrichment
    // ------------------------------------------------------------------

    /**
     * POST /api/ha-threat-intel/lookup
     * Body: { "value": "1.2.3.4" }
     *
     * Returns the full IocResultDTO if found in the local indicator database,
     * plus a ThreatIntelResponse-compatible summary in the "summary" field
     * for backward compat with the search-hunt service (GAP-CV-01).
     */
    @PostMapping("/lookup")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
                  "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
    public ResponseEntity<IocLookupResponse> lookupIoc(@RequestBody Map<String, String> body) {
        String value = body.get("value");
        if (value == null || value.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        log.debug("POST /api/ha-threat-intel/lookup value={}", value);

        return threatIntelService.lookupIoc(value)
            .map(dto -> ResponseEntity.ok(new IocLookupResponse(dto, toThreatIntelSummary(dto, value))))
            .orElse(ResponseEntity.ok(new IocLookupResponse(null, unknownSummary(value))));
    }

    // ------------------------------------------------------------------
    // IOC browser — paged search with optional type/feed filters
    // ------------------------------------------------------------------

    /**
     * GET /api/ha-threat-intel/iocs?search=&type=&feedId=&page=0&size=50
     */
    @GetMapping("/iocs")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
                  "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
    public ResponseEntity<List<IocBrowserEntry>> browseIocs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String feedId,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size) {
        log.debug("GET /api/ha-threat-intel/iocs search={} type={} feedId={} page={}", search, type, feedId, page);

        PageRequest pr = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "threatScore"));

        // Route to the most specific query to avoid full-table scans
        Page<UtmIocIndicator> results;
        boolean hasSearch = search != null && !search.isBlank();
        boolean hasType   = type   != null && !type.isBlank();
        boolean hasFeed   = feedId != null && !feedId.isBlank();

        if (hasSearch || hasType || hasFeed) {
            results = iocRepo.searchIocs(
                hasType ? type : null,
                hasFeed ? feedId : null,
                hasSearch ? search : null,
                pr
            );
        } else {
            results = iocRepo.findAll(pr);
        }

        List<IocBrowserEntry> entries = results.stream()
            .map(ind -> toBrowserEntry(ind, currentUserRoles()))
            .toList();

        HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
            results.getTotalElements(), page, size, "/api/ha-threat-intel/iocs");

        return ResponseEntity.ok().headers(headers).body(entries);
    }

    // ------------------------------------------------------------------
    // Inner response shapes
    // ------------------------------------------------------------------

    /** Combined response: full detail + lightweight summary for backward compat */
    public record IocLookupResponse(IocResultDTO detail, ThreatIntelSummary summary) {}

    /**
     * ThreatIntelResponse-compatible summary shape (matches frontend ThreatIntelResponse
     * in searchHunt.types.ts, resolving GAP-CV-01).
     */
    public record ThreatIntelSummary(
        String iocValue,
        String verdict,       // malicious | suspicious | clean | unknown
        String sourceFeed,
        String firstSeen,
        String lastSeen,
        List<String> attackTechniques,
        String tlp
    ) {}

    /** Flat row shape for the IOC browser grid */
    public record IocBrowserEntry(
        Long    id,
        String  value,
        String  iocType,
        Integer threatScore,
        String  classification,
        String  country,
        String  feedId,
        String  lastSeen,
        Integer alertCount,
        String  tlp,
        boolean restricted
    ) {
        static IocBrowserEntry from(UtmIocIndicator ind, String displayValue, String tlp, boolean restricted) {
            return new IocBrowserEntry(
                ind.getId(),
                displayValue,
                ind.getIocType(),
                ind.getThreatScore(),
                ind.getClassification(),
                ind.getCountry(),
                ind.getFeedId(),
                ind.getLastSeen() != null ? ind.getLastSeen().toString() : null,
                ind.getAlertCount() != null ? ind.getAlertCount() : 0,
                tlp,
                restricted
            );
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private ThreatIntelSummary toThreatIntelSummary(IocResultDTO dto, String lookupValue) {
        String verdict = deriveVerdict(dto.getThreatScore());
        String sourceFeed = dto.getSourceFeds() != null && !dto.getSourceFeds().isEmpty()
            ? String.valueOf(dto.getSourceFeds().get(0).getOrDefault("name", "unknown"))
            : null;
        List<String> techniques = dto.getMitreTechniques() != null
            ? dto.getMitreTechniques().stream()
                .map(m -> String.valueOf(m.getOrDefault("id", "")))
                .filter(s -> !s.isBlank())
                .toList()
            : List.of();
        String tlp = resolveTlp(lookupValue);
        return new ThreatIntelSummary(
            dto.getValue(),
            verdict,
            sourceFeed,
            dto.getFirstSeen() != null ? dto.getFirstSeen().toString() : null,
            dto.getLastSeen()  != null ? dto.getLastSeen().toString()  : null,
            techniques,
            tlp
        );
    }

    private ThreatIntelSummary unknownSummary(String value) {
        return new ThreatIntelSummary(value, "unknown", null, null, null, List.of(), resolveTlp(value));
    }

    private IocBrowserEntry toBrowserEntry(UtmIocIndicator ind, Collection<String> roles) {
        Optional<TlpFilteredIocDTO> tlpMatch =
            threatIntelLookupService.lookupIOCForUser(ind.getValue(), roles);
        if (tlpMatch.isPresent()) {
            TlpFilteredIocDTO filtered = tlpMatch.get();
            String display = filtered.getIocValue() != null ? filtered.getIocValue() : ind.getValue();
            return IocBrowserEntry.from(ind, display, filtered.getTlp(), filtered.isRestricted());
        }
        return IocBrowserEntry.from(ind, ind.getValue(), "WHITE", false);
    }

    private String resolveTlp(String value) {
        return threatIntelLookupService.lookupIOCForUser(value, currentUserRoles())
            .map(TlpFilteredIocDTO::getTlp)
            .orElse(null);
    }

    private Collection<String> currentUserRoles() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return List.of();
        }
        return auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .collect(Collectors.toSet());
    }

    private static String deriveVerdict(Integer threatScore) {
        if (threatScore == null) return "unknown";
        if (threatScore >= 75) return "malicious";
        if (threatScore >= 40) return "suspicious";
        if (threatScore >  0)  return "clean";
        return "unknown";
    }
}
