package com.hivearmor.web.rest;

import com.hivearmor.repository.HiveThreatIocRepository;
import com.hivearmor.security.AuthoritiesConstants;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HiveArmor REST controller for IOC aggregate statistics.
 *
 * GET /api/ha-threat-intel/stats — Admin|User|Analyst|SOC Manager (TI-002 STAGING CANDIDATE).
 * No Lombok — constructor injection only.
 */
@RestController
@RequestMapping("/api")
public class HaThreatIntelStatsResource {

    private final HiveThreatIocRepository iocRepository;

    public HaThreatIntelStatsResource(HiveThreatIocRepository iocRepository) {
        this.iocRepository = iocRepository;
    }

    /**
     * GET /api/ha-threat-intel/stats
     * Returns aggregate IOC statistics:
     *   totalActive, byType (ip/domain/hash/url/email), expiredToday
     */
    @GetMapping("/ha-threat-intel/stats")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
                  "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
    public ResponseEntity<Map<String, Object>> getStats() {
        long totalActive = iocRepository.countByActiveTrue();

        Map<String, Long> byType = new LinkedHashMap<>();
        byType.put("ip",     iocRepository.countByActiveTrueAndIocType("ip"));
        byType.put("domain", iocRepository.countByActiveTrueAndIocType("domain"));
        byType.put("hash",   iocRepository.countByActiveTrueAndIocType("hash"));
        byType.put("url",    iocRepository.countByActiveTrueAndIocType("url"));
        byType.put("email",  iocRepository.countByActiveTrueAndIocType("email"));

        Instant startOfDay = Instant.now().truncatedTo(ChronoUnit.DAYS);
        long expiredToday = iocRepository.countExpiredSince(startOfDay);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalActive", totalActive);
        stats.put("byType", byType);
        stats.put("expiredToday", expiredToday);

        return ResponseEntity.ok(stats);
    }
}
