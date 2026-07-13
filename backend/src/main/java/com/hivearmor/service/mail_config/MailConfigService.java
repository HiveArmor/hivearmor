package com.hivearmor.service.mail_config;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.domain.mail_sender.MailConfig;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.InternetAddress;
import java.io.UnsupportedEncodingException;
import java.util.List;

@Service
public class MailConfigService {
    public MailConfig getMailConfigFromParameters(List<UtmConfigurationParameter> parameters) throws UnsupportedEncodingException {
        MailConfig mailConfig = new MailConfig();

        mailConfig.setHost(getParamValue(parameters, Constants.PROP_MAIL_HOST));
        mailConfig.setUsername(getParamValue(parameters, Constants.PROP_MAIL_USERNAME));
        mailConfig.setPassword(getParamValue(parameters, Constants.PROP_MAIL_PASSWORD));
        mailConfig.setAuthType(getParamValue(parameters, Constants.PROP_MAIL_SMTP_AUTH));
        mailConfig.setFrom(String.valueOf(new InternetAddress(getParamValue(parameters, Constants.PROP_MAIL_FROM), getParamValue(parameters, Constants.PROP_MAIL_ORGNAME))));
        mailConfig.setPort(Integer.parseInt(getParamValue(parameters, Constants.PROP_MAIL_PORT)));

        return mailConfig;
    }

    public String getParamValue(List<UtmConfigurationParameter> parameters, String shortName){
        return parameters.stream()
                .filter(p -> p.getConfParamShort().equals(shortName))
                .findFirst()
                .map(UtmConfigurationParameter::getConfParamValue)
                .orElse(Constants.CFG.get(shortName));
    }
}
