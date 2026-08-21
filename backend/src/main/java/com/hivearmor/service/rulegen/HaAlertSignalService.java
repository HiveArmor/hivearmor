package com.hivearmor.service.rulegen;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.service.HaAlertContextService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Records analyst triage signals (true-positive / false-positive) for alerts.
 *
 * <p>Signal recording is idempotent: invoking {@link #recordSignal} multiple times
 * for the same {@code (alertId, signalType)} pair results in exactly one persisted row.
 * Idempotence is enforced at two levels:
 * <ol>
 *   <li>Application-level pre-check via {@link HaAlertSignalRepository#findByAlertIdAndSignalType}.</li>
 *   <li>Database-level unique constraint {@code uk_ha_alert_signal_alert_type} as a
 *       fallback against concurrent inserts.</li>
 * </ol>
 *
 * <p>Alert metadata (name, dataType, severity) is resolved through the Sprint 25
 * {@link HaAlertContextService} — this service does NOT introduce a duplicate
 * alert metadata loader (Requirement 6.4).
 *
 * @see HaAlertSignal
 * @see HaAlertSignalRepository
 */
@Service
public class HaAlertSignalService {

    private static final Logger log = LoggerFactory.getLogger(HaAlertSignalService.class);

    private final HaAlertSignalRepository signalRepo;
    private final HaAlertContextService alertContext;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public HaAlertSignalService(HaAlertSignalRepository signalRepo,
                                HaAlertContextService alertContext,
                                ObjectMapper objectMapper,
                                Clock clock) {
        this.signalRepo = signalRepo;
        this.alertContext = alertContext;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    /**
     * Records a signal for the given alert and signal type.
     *
     * <p>If a row already exists for the same {@code (alertId, signalType)} combination,
     * the method returns immediately (idempotent no-op). Otherwise, it resolves alert
     * metadata via {@link HaAlertContextService}, builds a new {@link HaAlertSignal} row,
     * and persists it.
     *
     * <p>A {@link DataIntegrityViolationException} from a concurrent insert race is
     * caught and treated as a no-op (idempotence preserved).
     *
     * @param alertId    the alert identifier; must not be {@code null}
     * @param signalType the signal type; must not be {@code null}
     * @throws NullPointerException if {@code alertId} or {@code signalType} is null
     */
    @Transactional
    public void recordSignal(String alertId, HaAlertSignal.SignalType signalType) {
        Objects.requireNonNull(alertId, "alertId");
        Objects.requireNonNull(signalType, "signalType");

        // Idempotence check: if the row already exists, do nothing.
        Optional<HaAlertSignal> existing = signalRepo.findByAlertIdAndSignalType(alertId, signalType);
        if (existing.isPresent()) {
            log.debug("Signal already recorded for alert={} type={}, skipping", alertId, signalType);
            return;
        }

        // Resolve alert metadata from the Sprint 25 context service.
        String alertName = null;
        String dataType = null;
        Integer severity = null;

        String alertJson = alertContext.loadAlertAsJson(alertId);
        if (alertJson != null) {
            try {
                Map<String, Object> fields = objectMapper.readValue(alertJson,
                    new TypeReference<Map<String, Object>>() {});
                alertName = fields.get("name") != null ? String.valueOf(fields.get("name")) : null;
                dataType = fields.get("dataType") != null ? String.valueOf(fields.get("dataType")) : null;
                Object sev = fields.get("severity");
                if (sev instanceof Number) {
                    severity = ((Number) sev).intValue();
                } else if (sev != null) {
                    try {
                        severity = Integer.parseInt(String.valueOf(sev));
                    } catch (NumberFormatException ignored) {
                        // severity stays null
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse alert context JSON for alertId={}: {}", alertId, e.getMessage());
            }
        }

        // Build and persist the new signal row.
        HaAlertSignal row = new HaAlertSignal();
        row.setAlertId(alertId);
        row.setSignalType(signalType);
        row.setAlertName(alertName);
        row.setDataType(dataType);
        row.setSeverity(severity);
        row.setRecordedBy(currentPrincipal());
        row.setRecordedAt(clock.instant());

        try {
            signalRepo.save(row);
        } catch (DataIntegrityViolationException race) {
            // Unique constraint fired — a concurrent invocation already inserted the row.
            // Idempotence preserved; log at debug level and return.
            log.debug("Signal race for alert={} type={}, treating as no-op", alertId, signalType);
        }
    }

    /**
     * Resolves the current security principal name, or {@code null} if no
     * authentication is present in the security context.
     */
    private static String currentPrincipal() {
        return Optional.ofNullable(SecurityContextHolder.getContext().getAuthentication())
            .map(Authentication::getName)
            .orElse(null);
    }
}
