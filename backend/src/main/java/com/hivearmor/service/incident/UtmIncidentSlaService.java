package com.hivearmor.service.incident;

import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class UtmIncidentSlaService {

    // SLA windows in hours per priority
    private static final Map<String, Long> SLA_HOURS = Map.of(
        "P1", 1L,
        "P2", 4L,
        "P3", 24L,
        "P4", 72L
    );

    private final UtmIncidentRepository incidentRepository;

    /**
     * Compute and set the SLA deadline based on priority, then save.
     */
    @Transactional
    public UtmIncident applyPriority(UtmIncident incident, String priority) {
        if (priority == null || !SLA_HOURS.containsKey(priority)) {
            priority = "P3";
        }
        incident.setIncidentPriority(priority);
        long hours = SLA_HOURS.get(priority);
        Instant deadline = (incident.getIncidentCreatedDate() != null ? incident.getIncidentCreatedDate() : Instant.now())
            .plus(hours, ChronoUnit.HOURS);
        incident.setSlaDeadline(deadline);
        incident.setSlaBreached(Instant.now().isAfter(deadline));
        return incidentRepository.save(incident);
    }

    /**
     * Every 5 minutes, mark open incidents whose SLA deadline has passed.
     */
    @Scheduled(fixedDelay = 300_000)
    @Transactional
    public void checkBreaches() {
        List<UtmIncident> candidates = incidentRepository.findBySlaBreachedFalseAndSlaDeadlineBefore(Instant.now());
        if (candidates.isEmpty()) return;
        candidates.forEach(i -> i.setSlaBreached(true));
        incidentRepository.saveAll(candidates);
        log.info("Marked {} incidents as SLA-breached", candidates.size());
    }

    public long getSlaHours(String priority) {
        return SLA_HOURS.getOrDefault(priority, 24L);
    }
}
