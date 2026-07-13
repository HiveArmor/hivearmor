package com.hivearmor.service;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.tfa.TfaMethod;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.tfa.TfaService;
import com.hivearmor.util.CipherUtil;
import com.hivearmor.util.exceptions.UtmMailException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

import static com.hivearmor.config.Constants.*;

/**
 * Service Implementation for managing UtmConfigurationParameter.
 */
@Service
@Transactional
public class UtmConfigurationParameterService {

    private static final String CLASSNAME = "UtmConfigurationParameterService";
    private final Logger log = LoggerFactory.getLogger(UtmConfigurationParameterService.class);

    private final UtmConfigurationParameterRepository configParamRepository;
    private final UserService userService;
    private final MailService mailService;
    private final ApplicationEventService applicationEventService;
    private final TfaService tfaService;

    public UtmConfigurationParameterService(UtmConfigurationParameterRepository configParamRepository,
                                            UserService userService,
                                            MailService mailService,
                                            ApplicationEventService applicationEventService, TfaService tfaService) {
        this.configParamRepository = configParamRepository;
        this.userService = userService;
        this.mailService = mailService;
        this.applicationEventService = applicationEventService;
        this.tfaService = tfaService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        final String ctx = CLASSNAME + ".init";
        try {
            List<UtmConfigurationParameter> params = configParamRepository.findAll();
            if (CollectionUtils.isEmpty(params))
                return;
            for (UtmConfigurationParameter p : params) {
                String value = p.getConfParamValue();
                if (StringUtils.hasText(value) && p.getConfParamDatatype().equalsIgnoreCase("password"))
                    try {
                        value = CipherUtil.decrypt(value, System.getenv(Constants.ENV_ENCRYPTION_KEY));
                    } catch (Exception e) {
                        String msg = String.format("%1$s: Fail to decrypt the value of the configuration parameter %2$s, error is: %3$s",
                                ctx, p.getConfParamLarge(), e.getLocalizedMessage());
                        log.error(msg);
                        applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
                        continue;
                    }
                Constants.CFG.put(p.getConfParamShort(), value);
            }
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    public void saveAll(List<UtmConfigurationParameter> params) throws UtmMailException {
        final String ctx = CLASSNAME + ".saveAll";
        try {

            Boolean tfaEnabledParam = params.stream()
                    .filter(p -> p.getConfParamShort().equals(Constants.PROP_TFA_ENABLE))
                    .findFirst()
                    .map(p -> Boolean.parseBoolean(p.getConfParamValue()))
                    .orElse(Boolean.valueOf(CFG.get(PROP_TFA_ENABLE)));

            TfaMethod tfaMethodParam = params.stream()
                    .filter(p -> p.getConfParamShort().equals(Constants.PROP_TFA_METHOD))
                    .findFirst()
                    .map(p -> TfaMethod.valueOf(p.getConfParamValue()))
                    .orElse(null);

            if (tfaEnabledParam && tfaMethodParam != null) {
                tfaService.persistConfiguration(tfaMethodParam);
                log.info("TFA enabled with method: {}", tfaMethodParam);
            }


            Map<String, String> cfg = new HashMap<>();
            for (UtmConfigurationParameter p : params) {
                cfg.put(p.getConfParamShort(), p.getConfParamValue());
                if (StringUtils.hasText(p.getConfParamValue()) && p.getConfParamDatatype().equalsIgnoreCase("password"))
                    p.setConfParamValue(CipherUtil.encrypt(p.getConfParamValue(), System.getenv(Constants.ENV_ENCRYPTION_KEY)));
            }
            configParamRepository.saveAll(params);
            Constants.CFG.putAll(cfg);
        } catch (UtmMailException e) {
            throw new UtmMailException(ctx + ": " + e.getMessage());
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * Get all the utmConfigurationParameters.
     *
     * @param pageable the pagination information
     * @return the list of entities
     */
    @Transactional(readOnly = true)
    public Page<UtmConfigurationParameter> findAll(Pageable pageable) {
        log.debug("Request to get all UtmConfigurationParameters");
        return configParamRepository.findAll(pageable);
    }


    /**
     * Get one utmConfigurationParameter by id.
     *
     * @param id the id of the entity
     * @return the entity
     */
    @Transactional(readOnly = true)
    public Optional<UtmConfigurationParameter> findOne(Long id) {
        log.debug("Request to get UtmConfigurationParameter : {}", id);
        return configParamRepository.findById(id);
    }

    /**
     * Delete the utmConfigurationParameter by id.
     *
     * @param id the id of the entity
     */
    public void delete(Long id) {
        log.debug("Request to delete UtmConfigurationParameter : {}", id);
        configParamRepository.deleteById(id);
    }

    public Map<String, String> getValueMapForDateSetting() throws Exception {
        final String ctx = CLASSNAME + ".getValueMapForDateSetting";
        try {
            return configParamRepository
                    .findAllBySectionId(DATE_FORMAT_SETTING_ID).stream()
                    .collect(Collectors.toMap(UtmConfigurationParameter::getConfParamShort,
                            UtmConfigurationParameter::getConfParamValue));
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    public List<UtmConfigurationParameter> getConfigParameterBySectionId(long sectionId) {
        final String ctx = CLASSNAME + ".getConfigParameterBySectionId";
        try {
            return new ArrayList<>(configParamRepository
                    .findAllBySectionId(sectionId));
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }


    public void saveAllConfigParams(List<UtmConfigurationParameter> params) {
        final String ctx = CLASSNAME + ".saveAllConfigParams";
        configParamRepository.saveAll(params);
        for (UtmConfigurationParameter param : params) {
            Constants.CFG.put(param.getConfParamShort(), param.getConfParamValue());
        }
    }

    public void validateMailConfOnMFAActivation() throws UtmMailException {
        final String ctx = CLASSNAME + ".validateMailConfOnMFAActivation";
        try {
            mailService.sendCheckEmail(List.of(userService.getCurrentUserLogin().getEmail()));
        } catch (Exception e) {
            throw new UtmMailException(ctx + ": " + e.getLocalizedMessage());
        }
    }
}
