package com.hivearmor.service.sigma;

import com.hivearmor.domain.correlation.rules.UtmCorrelationRules;
import com.hivearmor.event_processor.EventProcessorManagerService;
import com.hivearmor.repository.correlation.rules.UtmCorrelationRulesRepository;
import com.hivearmor.repository.sigma.SigmaSyncConfigRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * DET-SIGMA-001b — engineLoaded follows LoadReport, not reload HTTP.
 */
@ExtendWith(MockitoExtension.class)
class SigmaActivateEngineLoadedTest {

    @Mock
    private SigmaSyncConfigRepository syncConfigRepository;

    @Mock
    private UtmCorrelationRulesRepository rulesRepository;

    @Mock
    private EventProcessorManagerService eventProcessorManagerService;

    private SigmaSyncService service;

    @BeforeEach
    void setUp() {
        service = new SigmaSyncService(syncConfigRepository, rulesRepository, eventProcessorManagerService);
    }

    @Test
    void activate_engineLoadedFalseWhenReloadAcceptedButLoadReportOmitsRule() {
        UtmCorrelationRules rule = new UtmCorrelationRules();
        rule.setId(77L);
        rule.setRuleName("Suspicious PowerShell Encoded Command");
        when(rulesRepository.findById(77L)).thenReturn(Optional.of(rule));
        when(eventProcessorManagerService.requestRuleReload()).thenReturn(Map.of(
            "requested", true,
            "httpStatus", 202
        ));
        when(eventProcessorManagerService.loadReportLists("Suspicious PowerShell Encoded Command"))
            .thenReturn(false);

        Map<String, Object> result = service.activateStagedRule(77L);

        assertThat(result.get("activated")).isEqualTo(true);
        assertThat(result.get("engineLoaded")).isEqualTo(false);
        assertThat(result.get("reloadHttpAccepted")).isEqualTo(true);
        assertThat(String.valueOf(result.get("honesty"))).contains("LoadReport.loadedNames");
        assertThat(String.valueOf(result.get("honesty"))).contains("~30s");
        assertThat(String.valueOf(result.get("honesty"))).contains("not proof of load");
    }

    @Test
    void activate_engineLoadedTrueOnlyWhenLoadReportListsRule() {
        UtmCorrelationRules rule = new UtmCorrelationRules();
        rule.setId(88L);
        rule.setRuleName("PILOT-WIN-FAILED-LOGON");
        when(rulesRepository.findById(88L)).thenReturn(Optional.of(rule));
        when(eventProcessorManagerService.requestRuleReload()).thenReturn(Map.of(
            "requested", true,
            "httpStatus", 200
        ));
        when(eventProcessorManagerService.loadReportLists("PILOT-WIN-FAILED-LOGON")).thenReturn(true);

        Map<String, Object> result = service.activateStagedRule(88L);

        assertThat(result.get("engineLoaded")).isEqualTo(true);
        assertThat(result.get("ruleName")).isEqualTo("PILOT-WIN-FAILED-LOGON");
    }
}
