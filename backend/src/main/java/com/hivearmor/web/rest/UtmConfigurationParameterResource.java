package com.hivearmor.web.rest;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.UtmConfigurationParameterQueryService;
import com.hivearmor.service.UtmConfigurationParameterService;
import com.hivearmor.service.UtmStackService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.UtmConfigurationParameterCriteria;
import com.hivearmor.service.mail_config.MailConfigService;
import com.hivearmor.service.validators.email.EmailValidatorService;
import com.hivearmor.service.validators.tw_config.TwConfigValidatorService;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.util.exceptions.UtmMailException;
import com.hivearmor.web.rest.util.PaginationUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.Errors;
import org.springframework.web.bind.annotation.*;

import jakarta.mail.MessagingException;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;

/**
 * REST controller for managing UtmConfigurationParameter.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api")
public class UtmConfigurationParameterResource {

    private final Logger log = LoggerFactory.getLogger(UtmConfigurationParameterResource.class);

    private static final String CLASSNAME = "UtmConfigurationParameterResource";

    private final UtmConfigurationParameterService utmConfigurationParameterService;
    private final UtmConfigurationParameterQueryService utmConfigurationParameterQueryService;
    private final ApplicationEventService applicationEventService;
    private final EmailValidatorService emailValidatorService;
    private final MailConfigService mailConfigService;
    private final UtmStackService utmStackService;
    private final TwConfigValidatorService twConfigValidatorService;

    /**
     * PUT  /utm-configuration-parameters : Updates an existing utmConfigurationParameter.
     *
     * @param parameters the utmConfigurationParameter to update
     * @return the ResponseEntity with status 200 (OK) and with body the updated utmConfigurationParameter,
     * or with status 400 (Bad Request) if the utmConfigurationParameter is not valid,
     * or with status 500 (Internal Server Error) if the utmConfigurationParameter couldn't be updated
     */
    @PutMapping("/ha-configuration-parameters")
    public ResponseEntity<Void> updateConfigurationParameters(@Valid @RequestBody List<UtmConfigurationParameter> parameters) {
        final String ctx = CLASSNAME + ".updateUtmConfigurationParameter";
        try {
            Assert.notEmpty(parameters, "There isn't any parameter to update");
            for (UtmConfigurationParameter parameter : parameters) {
                Errors errors = new BeanPropertyBindingResult(parameter, "utmConfigurationParameter");

                if(parameter.getConfParamShort().equals("hivearmor.tw.enable")){
                    twConfigValidatorService.validate(parameter, errors);
                }

                if(StringUtils.hasText(parameter.getConfParamRegexp())){
                    emailValidatorService.validate(parameter, errors);
                }

                if (errors.hasErrors()) {
                    String msg =  String.format("Validation failed for field %s.", parameter.getConfParamShort());
                    log.error(msg);
                    applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
                    return ResponseUtil.buildPreconditionFailedResponse(msg);
                }
            }
            utmConfigurationParameterService.saveAll(parameters);
            return ResponseEntity.ok().build();
        } catch (UtmMailException e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildPreconditionFailedResponse(msg);
        } catch (IllegalArgumentException e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildBadRequestResponse(msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildInternalServerErrorResponse(msg);
        }
    }

    /**
     * GET  /utm-configuration-parameters : get all the utmConfigurationParameters.
     *
     * @param pageable the pagination information
     * @param criteria the criterias which the requested entities should match
     * @return the ResponseEntity with status 200 (OK) and the list of utmConfigurationParameters in body
     */
    @GetMapping("/ha-configuration-parameters")
    public ResponseEntity<List<UtmConfigurationParameter>> getAllUtmConfigurationParameters(@ParameterObject UtmConfigurationParameterCriteria criteria,
                                                                                            @ParameterObject Pageable pageable) {
        log.debug("REST request to get UtmConfigurationParameters by criteria: {}", criteria);
        Page<UtmConfigurationParameter> page = utmConfigurationParameterQueryService.findByCriteria(criteria, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-configuration-parameters");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * GET  /utm-configuration-parameters/:id : get the "id" utmConfigurationParameter.
     *
     * @param id the id of the utmConfigurationParameter to retrieve
     * @return the ResponseEntity with status 200 (OK) and with body the utmConfigurationParameter, or with status 404 (Not Found)
     */
    @GetMapping("/ha-configuration-parameters/{id}")
    public ResponseEntity<UtmConfigurationParameter> getUtmConfigurationParameter(@PathVariable Long id) {
        log.debug("REST request to get UtmConfigurationParameter : {}", id);
        Optional<UtmConfigurationParameter> utmConfigurationParameter = utmConfigurationParameterService.findOne(id);
        return tech.jhipster.web.util.ResponseUtil.wrapOrNotFound(utmConfigurationParameter);
    }

    @PostMapping ("/checkEmailConfiguration")
    public ResponseEntity<Void> checkEmailConfiguration(@Valid @RequestBody List<UtmConfigurationParameter> parameters) {
        final String ctx = CLASSNAME + ".checkEmailConfiguration";
        try {
            utmStackService.checkEmailConfiguration(this.mailConfigService.getMailConfigFromParameters(parameters));
            return ResponseEntity.ok().build();
        } catch (MessagingException e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildBadRequestResponse("Check failed with this configuration, review your configuration, save changes and try again");
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
