package com.hivearmor.web.rest.application_modules;

import com.hivearmor.aop.logging.AuditEvent;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.UtmModuleGroupConfiguration;
import com.hivearmor.event_processor.EventProcessorManagerService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.application_modules.UtmModuleGroupConfigurationService;
import com.hivearmor.service.dto.application_modules.GroupConfigurationDTO;
import com.hivearmor.service.dto.application_modules.ModuleDTO;
import com.hivearmor.service.dto.application_modules.UtmModuleMapper;
import com.hivearmor.web.rest.util.HeaderUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api")

public class UtmModuleGroupConfigurationResource {

    private static final String CLASSNAME = "UtmModuleGroupConfigurationResource";
    private final Logger log = LoggerFactory.getLogger(UtmModuleGroupConfigurationResource.class);
    private final UtmModuleGroupConfigurationService moduleGroupConfigurationService;
    private final ApplicationEventService applicationEventService;
    private final UtmModuleMapper utmModuleMapper;
    private final EventProcessorManagerService eventProcessorManagerService;


    @PutMapping("/module-group-configurations/update")
    @AuditEvent(
            attemptType = ApplicationEventType.CONFIG_UPDATE_ATTEMPT,
            attemptMessage = "Attempt to update configuration keys initiated for moduleId={moduleId}",
            successType = ApplicationEventType.CONFIG_UPDATE_SUCCESS,
            successMessage = "Configuration keys updated successfully for moduleId={moduleId}"
    )
    public ResponseEntity<Void> updateConfiguration(@Valid @RequestBody GroupConfigurationDTO body) {
        final String ctx = CLASSNAME + ".updateConfiguration";
        try {
            UtmModule module = moduleGroupConfigurationService.updateConfigurationKeys(body.getModuleId(), body.getKeys());
            ModuleDTO moduleDTO = utmModuleMapper.toDto(module, false);

            // Hot-reload is best-effort: config is already persisted in DB.
            // If EventProcessor is unreachable (e.g. plugin offline, local dev),
            // still return 200 — the plugin will pick up the new config on next restart.
            try {
                eventProcessorManagerService.updateModule(moduleDTO);
            } catch (Exception reloadEx) {
                log.warn("{}: EventProcessor hot-reload failed (config saved to DB): {}", ctx, reloadEx.getMessage());
            }

            return ResponseEntity.ok().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }

    @GetMapping("/module-group-configurations/by-group-id")
    public ResponseEntity<List<UtmModuleGroupConfiguration>> getConfigurationByGroupId(@RequestParam Long groupId) {
        final String ctx = CLASSNAME + ".getConfigurationByGroupId";
        try {
            return ResponseEntity.ok(moduleGroupConfigurationService.findAllByGroupId(groupId));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }

    @GetMapping("/module-group-configurations/by-group-and-key")
    public ResponseEntity<UtmModuleGroupConfiguration> getConfigurationByGroupIdAndConfKey(@RequestParam Long groupId,
                                                                                           @RequestParam String confKey) {
        final String ctx = CLASSNAME + ".getConfigurationByGroupIdAndConfKey";
        try {
            return ResponseEntity.ok(moduleGroupConfigurationService.findByGroupIdAndConfKey(groupId, confKey));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                HeaderUtil.createFailureAlert(null, null, msg)).body(null);
        }
    }

}
