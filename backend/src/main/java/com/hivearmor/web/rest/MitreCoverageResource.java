package com.hivearmor.web.rest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/mitre")
public class MitreCoverageResource {

    private static final Logger log = LoggerFactory.getLogger(MitreCoverageResource.class);

    @PersistenceContext
    private EntityManager entityManager;

    public record TechniqueCoverage(String technique, long ruleCount, long activeCount) {}

    @GetMapping("/coverage")
    public ResponseEntity<List<TechniqueCoverage>> getCoverage() {
        log.debug("GET /api/mitre/coverage");

        @SuppressWarnings("unchecked")
        List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT rule_technique, COUNT(*) AS rule_count, " +
            "SUM(CASE WHEN rule_active = true THEN 1 ELSE 0 END) AS active_count " +
            "FROM hive_correlation_rules " +
            "WHERE rule_technique IS NOT NULL AND rule_technique <> '' " +
            "GROUP BY rule_technique " +
            "ORDER BY rule_technique"
        ).getResultList();

        List<TechniqueCoverage> result = rows.stream()
            .map(r -> new TechniqueCoverage(
                (String) r[0],
                ((Number) r[1]).longValue(),
                ((Number) r[2]).longValue()
            ))
            .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    public record RuleRef(long id, String name, boolean active) {}

    @GetMapping("/rules")
    public ResponseEntity<List<RuleRef>> getRulesByTechnique(@RequestParam String techniqueId) {
        log.debug("GET /api/mitre/rules?techniqueId={}", techniqueId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT id, rule_name, rule_active FROM hive_correlation_rules " +
            "WHERE rule_technique LIKE :prefix AND rule_technique IS NOT NULL " +
            "ORDER BY rule_active DESC, rule_name " +
            "LIMIT 200"
        )
        .setParameter("prefix", techniqueId + "%")
        .getResultList();

        List<RuleRef> result = rows.stream()
            .map(r -> new RuleRef(
                ((Number) r[0]).longValue(),
                (String) r[1],
                Boolean.TRUE.equals(r[2])
            ))
            .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @GetMapping("/coverage/export")
    public ResponseEntity<byte[]> exportCoverage() {
        log.debug("GET /api/mitre/coverage/export");

        @SuppressWarnings("unchecked")
        List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT rule_technique, COUNT(*) AS rule_count, " +
            "SUM(CASE WHEN rule_active = true THEN 1 ELSE 0 END) AS active_count " +
            "FROM hive_correlation_rules " +
            "WHERE rule_technique IS NOT NULL AND rule_technique <> '' " +
            "GROUP BY rule_technique " +
            "ORDER BY rule_technique"
        ).getResultList();

        StringBuilder csv = new StringBuilder("technique,ruleCount,activeCount\n");
        for (Object[] r : rows) {
            csv.append(r[0]).append(",")
               .append(((Number) r[1]).longValue()).append(",")
               .append(((Number) r[2]).longValue()).append("\n");
        }

        byte[] bytes = csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("text/csv"));
        headers.setContentDispositionFormData("attachment", "mitre-coverage.csv");
        headers.setContentLength(bytes.length);

        return ResponseEntity.ok().headers(headers).body(bytes);
    }
}
