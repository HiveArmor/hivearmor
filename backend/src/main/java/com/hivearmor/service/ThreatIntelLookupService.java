package com.hivearmor.service;

import com.hivearmor.domain.HiveThreatIoc;
import com.hivearmor.repository.HiveThreatIocRepository;
import com.hivearmor.service.dto.TlpFilteredIocDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HiveArmor Threat Intelligence IOC lookup service.
 *
 * Provides plain lookups (lookupIOC) and TLP-aware lookups (lookupIOCForUser).
 *
 * Privilege model:
 *   Privileged  = holds ROLE_ADMIN or ROLE_THREAT_ANALYST
 *   WHITE/GREEN  → full value for everyone
 *   AMBER        → full value for privileged, redact(value, type) for others
 *   RED          → full value for privileged, null + restricted=true for others
 *
 * MUST NOT log raw IOC values at any log level.
 * No Lombok — constructor injection only.
 */
@Service
public class ThreatIntelLookupService {

    private static final Logger log = LoggerFactory.getLogger(ThreatIntelLookupService.class);

    private static final String ROLE_ADMIN          = "ROLE_ADMIN";
    private static final String ROLE_THREAT_ANALYST = "ROLE_THREAT_ANALYST";

    // URL host extraction pattern
    private static final Pattern URL_HOST_PATTERN =
        Pattern.compile("^(https?://)([^/]+)(/.*)$");

    private final HiveThreatIocRepository iocRepository;

    public ThreatIntelLookupService(HiveThreatIocRepository iocRepository) {
        this.iocRepository = iocRepository;
    }

    /**
     * Look up the highest-confidence active IOC matching the given value.
     * MUST NOT log the raw IOC value at any log level.
     *
     * @param value the IOC value to look up
     * @return the best active match, or empty if none found
     */
    public Optional<HiveThreatIoc> lookupIOC(String value) {
        return iocRepository.findFirstByIocValueAndActiveTrue(value);
    }

    /**
     * TLP-aware IOC lookup. Returns a filtered DTO based on the caller's roles.
     *
     * @param value     raw IOC value
     * @param userRoles collection of Spring Security authority strings for the caller
     * @return filtered DTO if an active IOC is found, empty otherwise
     */
    public Optional<TlpFilteredIocDTO> lookupIOCForUser(String value,
                                                         Collection<String> userRoles) {
        Optional<HiveThreatIoc> match = iocRepository.findFirstByIocValueAndActiveTrue(value);
        if (match.isEmpty()) {
            return Optional.empty();
        }

        HiveThreatIoc ioc = match.get();
        boolean privileged = userRoles.contains(ROLE_ADMIN)
            || userRoles.contains(ROLE_THREAT_ANALYST);

        String tlp = ioc.getTlp() != null ? ioc.getTlp() : "WHITE";

        String displayValue;
        boolean restricted = false;

        switch (tlp) {
            case "RED":
                if (privileged) {
                    displayValue = ioc.getIocValue();
                } else {
                    displayValue = null;
                    restricted = true;
                }
                break;
            case "AMBER":
                if (privileged) {
                    displayValue = ioc.getIocValue();
                } else {
                    displayValue = redact(ioc.getIocValue(), ioc.getIocType());
                }
                break;
            default:
                // WHITE, GREEN — full value for everyone
                displayValue = ioc.getIocValue();
        }

        TlpFilteredIocDTO dto = new TlpFilteredIocDTO(
            ioc.getIocType(),
            displayValue,
            ioc.getConfidence(),
            tlp,
            restricted
        );
        return Optional.of(dto);
    }

    /**
     * Redacts an IOC value based on its type.
     *
     * ip     — replaces last octet:      1.2.3.4       → 1.2.3.*
     * domain — replaces last label:      evil.example.com → evil.example.*
     * hash   — replaces last 32 chars:   abc...xyz      → abc...[trimmed]***
     * url    — replaces host:             https://a.b/c  → https://[REDACTED]/c
     * email  — replaces domain:          a@b.com        → a@[REDACTED]
     * other  — returns ***
     *
     * @param value   raw IOC value
     * @param type    normalized IOC type
     * @return redacted string (never equal to original for supported types)
     */
    public String redact(String value, String type) {
        if (value == null || value.isEmpty() || type == null) {
            return "***";
        }
        switch (type) {
            case "ip": {
                int lastDot = value.lastIndexOf('.');
                if (lastDot < 0) return "***";
                return value.substring(0, lastDot + 1) + "*";
            }
            case "domain": {
                int lastDot = value.lastIndexOf('.');
                if (lastDot < 0) return "***";
                return value.substring(0, lastDot + 1) + "*";
            }
            case "hash": {
                if (value.length() > 32) {
                    return value.substring(0, value.length() - 32) + "***";
                }
                return "***";
            }
            case "url": {
                Matcher m = URL_HOST_PATTERN.matcher(value);
                if (m.matches()) {
                    return m.group(1) + "[REDACTED]" + m.group(3);
                }
                return "https://[REDACTED]/";
            }
            case "email": {
                int at = value.indexOf('@');
                if (at < 0) return "***";
                return value.substring(0, at + 1) + "[REDACTED]";
            }
            default:
                return "***";
        }
    }
}
