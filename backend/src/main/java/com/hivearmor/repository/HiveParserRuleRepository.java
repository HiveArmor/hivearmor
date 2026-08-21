package com.hivearmor.repository;

import com.hivearmor.domain.HiveParserRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HiveParserRuleRepository extends JpaRepository<HiveParserRule, Long> {

    List<HiveParserRule> findAllByStatus(String status);

    List<HiveParserRule> findAllByDataType(String dataType);
}
