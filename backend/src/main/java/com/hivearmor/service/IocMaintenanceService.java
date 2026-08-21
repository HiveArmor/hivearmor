package com.hivearmor.service;

import com.hivearmor.domain.HiveThreatIoc;
import com.hivearmor.repository.HiveThreatIocRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * HiveArmor IOC maintenance service.
 *
 * Runs a three-pass daily maintenance cycle at 03:00 UTC:
 *   Pass 1 — deduplication: marks the highest-confidence row primary_ioc = true
 *   Pass 2 — confidence decay: reduces confidence for IOCs not seen in 30+ days
 *   Pass 3 — auto-expiry: deactivates expired or stale IOCs
 *
 * No Lombok — constructor injection only.
 * Never logs raw IOC values.
 * Never calls List.getFirst() — uses .get(0) for Java 17 compatibility.
 */
@Service
@Transactional
public class IocMaintenanceService {

    private static final Logger log = LoggerFactory.getLogger(IocMaintenanceService.class);

    private static final int DECAY_THRESHOLD_DAYS = 30;
    private static final double DECAY_FACTOR = 0.9;
    private static final int MIN_CONFIDENCE = 10;
    private static final int STALE_THRESHOLD_DAYS = 90;

    private final HiveThreatIocRepository iocRepository;

    public IocMaintenanceService(HiveThreatIocRepository iocRepository) {
        this.iocRepository = iocRepository;
    }

    /**
     * Scheduled daily maintenance at 03:00 UTC.
     * Runs deduplication, confidence decay, and auto-expiry in order.
     */
    @Scheduled(cron = "0 0 3 * * *")
    public void runDailyMaintenance() {
        log.info("HiveArmor IOC daily maintenance starting");
        deduplicateIocs();
        applyConfidenceDecay();
        expireStaleIocs();
        log.info("HiveArmor IOC daily maintenance complete");
    }

    /**
     * Pass 1 — Deduplication.
     *
     * Groups all active IOCs by (ioc_type, ioc_value). Within each group with
     * more than one row, the first row by confidence DESC is marked primary_ioc = true;
     * all others are marked false.
     *
     * Uses .get(0) rather than .getFirst() for Java 17 compatibility.
     */
    public void deduplicateIocs() {
        log.info("HiveArmor IOC deduplication starting");

        List<HiveThreatIoc> allActive = iocRepository.findAll().stream()
            .filter(i -> Boolean.TRUE.equals(i.getActive()))
            .collect(java.util.stream.Collectors.toList());

        // Group by (iocType, iocValue)
        Map<String, List<HiveThreatIoc>> groups = new HashMap<>();
        for (HiveThreatIoc ioc : allActive) {
            String key = ioc.getIocType() + "|" + ioc.getIocValue();
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(ioc);
        }

        List<HiveThreatIoc> toSave = new ArrayList<>();

        for (List<HiveThreatIoc> group : groups.values()) {
            if (group.size() > 1) {
                // Sort by confidence descending (stable on ties)
                group.sort(Comparator.comparingInt((HiveThreatIoc i) ->
                    i.getConfidence() != null ? i.getConfidence() : 0).reversed());

                // Mark primary — use .get(0) not .getFirst()
                group.get(0).setPrimaryIoc(true);
                for (int i = 1; i < group.size(); i++) {
                    group.get(i).setPrimaryIoc(false);
                }
                toSave.addAll(group);
            }
        }

        if (!toSave.isEmpty()) {
            iocRepository.saveAll(toSave);
        }

        log.info("HiveArmor IOC deduplication complete, groups processed={}", groups.size());
    }

    /**
     * Pass 2 — Confidence decay.
     *
     * Applies a 10% decay to all active IOCs whose last_seen is older than 30 days.
     * New confidence = max(floor(confidence * 0.9), MIN_CONFIDENCE).
     */
    public void applyConfidenceDecay() {
        log.info("HiveArmor IOC confidence decay starting");

        Instant threshold = Instant.now().minus(DECAY_THRESHOLD_DAYS, ChronoUnit.DAYS);
        List<HiveThreatIoc> stale = iocRepository.findActiveOlderThan(threshold);

        for (HiveThreatIoc ioc : stale) {
            if (ioc.getConfidence() != null) {
                int newConf = (int) Math.max(ioc.getConfidence() * DECAY_FACTOR, MIN_CONFIDENCE);
                ioc.setConfidence(newConf);
            }
        }

        if (!stale.isEmpty()) {
            iocRepository.saveAll(stale);
        }

        log.info("HiveArmor IOC confidence decay complete, iocs decayed={}", stale.size());
    }

    /**
     * Pass 3 — Auto-expiry.
     *
     * Sets active = false for any IOC that satisfies at least one trigger:
     *   - expires_at is non-null and before now
     *   - confidence is non-null and below MIN_CONFIDENCE
     *   - last_seen is non-null and before (now - STALE_THRESHOLD_DAYS)
     */
    public void expireStaleIocs() {
        log.info("HiveArmor IOC expiry starting");

        Instant now = Instant.now();
        Instant staleThreshold = now.minus(STALE_THRESHOLD_DAYS, ChronoUnit.DAYS);

        List<HiveThreatIoc> allIocs = iocRepository.findAll();
        List<HiveThreatIoc> toExpire = new ArrayList<>();

        for (HiveThreatIoc ioc : allIocs) {
            if (!Boolean.TRUE.equals(ioc.getActive())) {
                continue;
            }

            boolean expired = (ioc.getExpiresAt() != null && ioc.getExpiresAt().isBefore(now))
                || (ioc.getConfidence() != null && ioc.getConfidence() < MIN_CONFIDENCE)
                || (ioc.getLastSeen() != null && ioc.getLastSeen().isBefore(staleThreshold));

            if (expired) {
                ioc.setActive(false);
                toExpire.add(ioc);
            }
        }

        if (!toExpire.isEmpty()) {
            iocRepository.saveAll(toExpire);
        }

        log.info("HiveArmor IOC expiry complete, iocs expired={}", toExpire.size());
    }
}
