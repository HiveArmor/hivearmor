package com.hivearmor.service.dto.compliance;

import jakarta.validation.constraints.NotNull;
import java.util.List;

public class ScheduleDeliveryDTO {

    @NotNull
    private Boolean emailEnabled;

    private List<String> recipients;

    private List<String> ccRecipients;

    public Boolean getEmailEnabled() { return emailEnabled; }
    public void setEmailEnabled(Boolean emailEnabled) { this.emailEnabled = emailEnabled; }

    public List<String> getRecipients() { return recipients; }
    public void setRecipients(List<String> recipients) { this.recipients = recipients; }

    public List<String> getCcRecipients() { return ccRecipients; }
    public void setCcRecipients(List<String> ccRecipients) { this.ccRecipients = ccRecipients; }
}
