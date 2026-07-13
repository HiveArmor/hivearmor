package com.hivearmor.service.correlation.rules;

import com.hivearmor.domain.correlation.rules.UtmRulePushLog;
import com.hivearmor.repository.correlation.rules.UtmRulePushLogRepository;
import com.hivearmor.service.grpc.CommandResult;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import io.grpc.stub.StreamObserver;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UtmRulePushService {

    private final Logger log = LoggerFactory.getLogger(UtmRulePushService.class);
    private final UtmRulePushLogRepository pushLogRepository;
    private final IncidentResponseCommandService incidentResponseCommandService;

    public void pushRuleToAgents(Long ruleId, String ruleName, List<String> agentIds, String pushedBy) {
        for (String agentId : agentIds) {
            UtmRulePushLog pushLog = new UtmRulePushLog();
            pushLog.setRuleId(ruleId);
            pushLog.setRuleName(ruleName);
            pushLog.setAgentId(agentId);
            pushLog.setPushedAt(Instant.now());
            pushLog.setPushStatus("PENDING");
            final UtmRulePushLog savedLog = pushLogRepository.save(pushLog);

            incidentResponseCommandService.sendCommand(
                agentId,
                "SYNC_RULES:" + ruleId,
                "RULE_DISTRIBUTION",
                ruleId.toString(),
                "Push rule to agent",
                pushedBy,
                "",
                new StreamObserver<CommandResult>() {
                    @Override
                    public void onNext(CommandResult value) {
                        savedLog.setPushStatus("DELIVERED");
                        savedLog.setAckAt(Instant.now());
                        pushLogRepository.save(savedLog);
                    }

                    @Override
                    public void onError(Throwable t) {
                        savedLog.setPushStatus("FAILED");
                        savedLog.setErrorMsg(t.getMessage());
                        pushLogRepository.save(savedLog);
                        log.error("Rule push failed for agent {}: {}", agentId, t.getMessage());
                    }

                    @Override
                    public void onCompleted() {
                        log.debug("Rule push stream completed for agent {}", agentId);
                    }
                }
            );
        }
    }

    public List<UtmRulePushLog> getPushStatus(Long ruleId) {
        return pushLogRepository.findByRuleIdOrderByPushedAtDesc(ruleId);
    }
}
