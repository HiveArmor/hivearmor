package com.hivearmor.web.rest;


import com.hivearmor.config.Constants;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.UtmConfigurationParameterService;
import com.hivearmor.service.UtmStackService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.util.CipherUtil;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.info.InfoEndpoint;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for managing the current user's account.
 */
@RestController
@RequestMapping("/api")
public class UtmStackResource {
    private final Logger log = LoggerFactory.getLogger(UtmStackResource.class);
    private static final String CLASSNAME = "UtmStackResource";

    private final UtmStackService utmStackService;
    private final ApplicationEventService applicationEventService;
    private final UtmConfigurationParameterService utmConfigurationParameterService;
    private final InfoEndpoint infoEndpoint;



    public UtmStackResource(UtmStackService utmStackService,
                            ApplicationEventService applicationEventService,
                            UtmConfigurationParameterService utmConfigurationParameterService,
                            InfoEndpoint infoEndpoint) {
        this.utmStackService = utmStackService;
        this.applicationEventService = applicationEventService;
        this.utmConfigurationParameterService = utmConfigurationParameterService;
        this.infoEndpoint = infoEndpoint;
    }

    @GetMapping("/ping")
    public ResponseEntity<HttpStatus> ping() {
        return ResponseEntity.ok(HttpStatus.OK);
    }

    @GetMapping("/date-format")
    public ResponseEntity<Map<String, String>> dateFormat() {
        final String ctx = CLASSNAME + ".dateFormat";
        try {
            return ResponseEntity.ok(utmConfigurationParameterService.getValueMapForDateSetting());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/healthcheck")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        final String ctx = CLASSNAME + ".healthCheck";
        try {
            utmStackService.executeChecks();
            Map<String, Object> body = utmStackService.getMigrationStatus();
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/isInDevelop")
    public ResponseEntity<Boolean> isInDevelop() {
        final String ctx = CLASSNAME + ".isInDevelop";
        try {
            return ResponseEntity.ok(utmStackService.isInDevelop());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/encrypt")
    public ResponseEntity<String> encrypt(@RequestBody String str) {
        final String ctx = CLASSNAME + ".encrypt";
        try {
            if (!StringUtils.hasText(str))
                throw new Exception("Content to encrypt is missing");
            return ResponseEntity.ok(CipherUtil.encrypt(str, System.getenv(Constants.ENV_ENCRYPTION_KEY)));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
