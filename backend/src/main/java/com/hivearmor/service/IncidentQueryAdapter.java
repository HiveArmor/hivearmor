package com.hivearmor.service;

import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Default adapter that resolves {@link IncidentQueryPort} against the JPA
 * {@link UtmIncidentRepository}.
 *
 * <p>Only the raw field map is returned here; whitelist filtering is the
 * responsibility of {@link HaIncidentContextService}.
 *
 * <p>The map key names are normalised to match the whitelist keys declared in
 * {@link HaIncidentContextService#INCIDENT_WHITELIST}:
 * {@code id, incidentName, incidentStatus, incidentSeverity, incidentObservations}.
 * The {@code incidentObservations} key is populated from
 * {@link UtmIncident#getIncidentDescription()} — the closest equivalent
 * plain-text observation field on the existing entity.
 */
@Component
public class IncidentQueryAdapter implements IncidentQueryPort {

    private static final Logger log = LoggerFactory.getLogger(IncidentQueryAdapter.class);

    private final UtmIncidentRepository incidentRepository;

    public IncidentQueryAdapter(UtmIncidentRepository incidentRepository) {
        this.incidentRepository = incidentRepository;
    }

    @Override
    public Map<String, Object> findById(String incidentId) {
        try {
            Long id = Long.parseLong(incidentId);
            Optional<UtmIncident> opt = incidentRepository.findById(id);
            if (opt.isEmpty()) {
                return null;
            }
            UtmIncident incident = opt.get();

            // Build a map with keys that match INCIDENT_WHITELIST in
            // HaIncidentContextService.  Enum/Integer values are stored as their
            // String/numeric equivalents so that ObjectMapper serialises them cleanly.
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", incident.getId());
            result.put("incidentName", incident.getIncidentName());
            result.put("incidentStatus",
                incident.getIncidentStatus() != null
                    ? incident.getIncidentStatus().toString()
                    : null);
            result.put("incidentSeverity", incident.getIncidentSeverity());
            // incidentObservations → mapped from incidentDescription
            result.put("incidentObservations", incident.getIncidentDescription());
            return result;
        } catch (NumberFormatException e) {
            log.warn("IncidentQueryAdapter.findById: non-numeric incidentId={}", incidentId);
            return null;
        } catch (Exception e) {
            log.warn("IncidentQueryAdapter.findById failed for incidentId={}", incidentId);
            return null;
        }
    }
}
