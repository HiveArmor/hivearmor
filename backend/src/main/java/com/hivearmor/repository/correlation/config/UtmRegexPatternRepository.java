package com.hivearmor.repository.correlation.config;

import com.hivearmor.domain.correlation.config.UtmDataTypes;
import com.hivearmor.domain.correlation.config.UtmRegexPattern;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UtmRegexPatternRepository extends JpaRepository<UtmRegexPattern, Long>, JpaSpecificationExecutor<UtmRegexPattern> {
    @Query(nativeQuery = true, value = "SELECT nextval('hive_regex_pattern_id_seq')")
    Long getNextId();

    @Query(value = "SELECT rp FROM UtmRegexPattern rp WHERE" +
            "(:search IS NULL OR ((rp.patternId LIKE :search OR lower(rp.patternId) LIKE lower(:search)) " +
            "OR (rp.patternDescription LIKE :search OR lower(rp.patternDescription) LIKE lower(:search))))")
    Page<UtmRegexPattern> searchByFilters(@Param("search") String search,
                                       Pageable pageable);
}
