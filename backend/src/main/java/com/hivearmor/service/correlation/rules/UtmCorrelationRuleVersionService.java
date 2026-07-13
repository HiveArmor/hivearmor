package com.hivearmor.service.correlation.rules;

import com.google.gson.Gson;
import com.hivearmor.domain.correlation.rules.UtmCorrelationRuleVersion;
import com.hivearmor.domain.correlation.rules.UtmCorrelationRules;
import com.hivearmor.repository.correlation.rules.UtmCorrelationRuleVersionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional
public class UtmCorrelationRuleVersionService {

    private final UtmCorrelationRuleVersionRepository versionRepository;
    private final UtmCorrelationRulesService correlationRulesService;
    private final Gson gson = new Gson();

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public UtmCorrelationRuleVersion snapshotRule(UtmCorrelationRules rule, String changedBy, String note) {
        int nextVersion = versionRepository.countByRuleId(rule.getId()) + 1;
        UtmCorrelationRuleVersion version = new UtmCorrelationRuleVersion();
        version.setRuleId(rule.getId());
        version.setVersionNum(nextVersion);
        version.setRuleSnapshot(gson.toJson(rule));
        version.setChangedBy(changedBy != null ? changedBy : "system");
        version.setChangedAt(Instant.now());
        version.setChangeNote(note);
        return versionRepository.save(version);
    }

    @Transactional(readOnly = true)
    public List<UtmCorrelationRuleVersion> getVersions(Long ruleId) {
        return versionRepository.findByRuleIdOrderByVersionNumDesc(ruleId);
    }

    @Transactional(readOnly = true)
    public Optional<UtmCorrelationRuleVersion> getVersion(Long ruleId, int versionNum) {
        return versionRepository.findByRuleIdAndVersionNum(ruleId, versionNum);
    }

    public UtmCorrelationRules rollback(Long ruleId, int versionNum, String changedBy) throws Exception {
        UtmCorrelationRuleVersion snapshot = versionRepository
            .findByRuleIdAndVersionNum(ruleId, versionNum)
            .orElseThrow(() -> new RuntimeException("Version " + versionNum + " not found for rule " + ruleId));

        UtmCorrelationRules restored = gson.fromJson(snapshot.getRuleSnapshot(), UtmCorrelationRules.class);
        correlationRulesService.updateRule(restored, true);

        UtmCorrelationRules updated = correlationRulesService.findOne(ruleId)
            .orElseThrow(() -> new RuntimeException("Rule " + ruleId + " not found after rollback"));
        snapshotRule(updated, changedBy, "Rolled back to v" + versionNum);
        return updated;
    }
}
