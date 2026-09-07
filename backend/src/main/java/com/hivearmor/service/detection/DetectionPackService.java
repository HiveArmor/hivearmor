package com.hivearmor.service.detection;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.DetectionRuleRepository;
import com.hivearmor.repository.correlation.rules.UtmCorrelationRulesRepository;
import com.hivearmor.repository.detection.HaDetectionExceptionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DET-MSSP-001 — pack inventory for the Detection Engineering tenant selector.
 */
@Service
public class DetectionPackService {

    private final DetectionRuleRepository detectionRuleRepository;
    private final UtmCorrelationRulesRepository correlationRulesRepository;
    private final HaDetectionExceptionRepository exceptionRepository;

    public DetectionPackService(DetectionRuleRepository detectionRuleRepository,
                                UtmCorrelationRulesRepository correlationRulesRepository,
                                HaDetectionExceptionRepository exceptionRepository) {
        this.detectionRuleRepository = detectionRuleRepository;
        this.correlationRulesRepository = correlationRulesRepository;
        this.exceptionRepository = exceptionRepository;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> listPacks() {
        Long requestTenantId = TenantContext.getClientId();
        List<Map<String, Object>> packs = new ArrayList<>();
        packs.add(buildPack(
            null,
            "platform",
            "Platform pack",
            true,
            correlationRulesRepository.countByTenantIdIsNull(),
            detectionRuleRepository.countByTenantId(DetectionPackScope.PLATFORM_TENANT_ID),
            exceptionRepository.countByTenantIdIsNull()
        ));

        if (!DetectionPackScope.isPlatform(requestTenantId)) {
            String prefix = TenantContext.getClientPrefix();
            String label = (prefix == null || prefix.isBlank())
                ? "Tenant " + requestTenantId + " custom pack"
                : prefix + " custom pack";
            packs.add(buildPack(
                requestTenantId,
                prefix == null || prefix.isBlank() ? "tenant-" + requestTenantId : prefix,
                label,
                false,
                correlationRulesRepository.countByTenantId(requestTenantId),
                detectionRuleRepository.countByTenantId(requestTenantId),
                exceptionRepository.countByTenantId(requestTenantId)
            ));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("packs", packs);
        body.put("selectedTenantId", DetectionPackScope.isPlatform(requestTenantId) ? null : requestTenantId);
        body.put("honesty", DetectionPackScope.HONESTY);
        return body;
    }

    private static Map<String, Object> buildPack(Long tenantId,
                                                 String prefix,
                                                 String label,
                                                 boolean shared,
                                                 long correlationRules,
                                                 long detectionRules,
                                                 long exceptions) {
        Map<String, Object> pack = new LinkedHashMap<>();
        pack.put("tenantId", tenantId);
        pack.put("prefix", prefix);
        pack.put("label", label);
        pack.put("shared", shared);
        pack.put("correlationRuleCount", correlationRules);
        pack.put("detectionRuleCount", detectionRules);
        pack.put("exceptionCount", exceptions);
        return pack;
    }
}
