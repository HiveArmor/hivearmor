package com.hivearmor.repository;

import com.hivearmor.domain.HaSigmaRule;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Spring Data JPA repository for {@link HaSigmaRule}.
 *
 * Finders support the paged rule-listing endpoint GET /api/ha-sigma/rules
 * with optional logsourceProduct and minSeverity filters.
 */
@Repository
public interface HaSigmaRuleRepository extends JpaRepository<HaSigmaRule, Long> {

    Optional<HaSigmaRule> findBySigmaId(String sigmaId);

    Page<HaSigmaRule> findByLogsourceProduct(String product, Pageable p);

    Page<HaSigmaRule> findByHaSeverityGreaterThanEqual(Integer min, Pageable p);

    Page<HaSigmaRule> findByLogsourceProductAndHaSeverityGreaterThanEqual(
        String product, Integer min, Pageable p);
}
