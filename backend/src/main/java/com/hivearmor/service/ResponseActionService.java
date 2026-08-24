package com.hivearmor.service;

import com.hivearmor.service.dto.ResponseActionDTO;
import com.hivearmor.service.dto.ResponseActionParamDTO;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;

/**
 * Provides the built-in SOAR response action catalogue.
 * <p>
 * Returns the eight built-in actions in a fixed, documented order.
 * {@code usageCount} is hard-coded to {@code 0} in Sprint 18; a future sprint
 * will compute real usage by scanning {@code hive_playbook.definition_json}.
 * </p>
 * No Lombok — all construction uses explicit setters. No injected dependencies —
 * the default no-arg constructor is sufficient.
 */
@Service
public class ResponseActionService {

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Returns the eight built-in response actions in canonical order.
     * Every action has {@code usageCount = 0} until Sprint 19 computes real usage.
     */
    public List<ResponseActionDTO> getLibrary() {
        return Arrays.asList(
            action("isolate-host",       "Isolate Host",            "EDR",
                   "Isolate an endpoint from the network via the EDR agent.",
                   Arrays.asList(
                       param("agentId", "string", true,  null, null)
                   )),

            action("block-ip",           "Block IP on Firewall",    "Network",
                   "Block inbound and outbound traffic for an IP address.",
                   Arrays.asList(
                       param("ip",       "string",  true,  null, null),
                       param("duration", "integer", false, 3600, null)
                   )),

            action("disable-user",       "Disable AD User",         "Identity",
                   "Disable a user account in Active Directory.",
                   Arrays.asList(
                       param("username", "string", true,  null, null),
                       param("reason",   "string", false, null, null)
                   )),

            action("create-jira-ticket", "Create Jira Ticket",      "Ticketing",
                   "POST ticket fields to a ticketing webhook (SSRF-safe). Requires url/webhookUrl.",
                   Arrays.asList(
                       param("url",      "string", true,  null, null),
                       param("project",  "string", true,  null, null),
                       param("summary",  "string", true,  null, null),
                       paramSelect("priority", false, "Medium",
                                   Arrays.asList("Highest", "High", "Medium", "Low")),
                       param("description", "text", false, null, null)
                   )),

            action("send-webhook",       "Send Webhook",            "Integration",
                   "POST a JSON payload to an external URL.",
                   Arrays.asList(
                       param("url",              "string", true, null, null),
                       param("payload_template", "text",   true, null, null)
                   )),

            action("send-email",         "Send Email Alert",        "Notification",
                   "Send an email notification with alert context.",
                   Arrays.asList(
                       param("to",            "string", true, null, null),
                       param("subject",       "string", true, null, null),
                       param("body_template", "text",   true, null, null)
                   )),

            action("quarantine-file",    "Quarantine File",         "EDR",
                   "Move a suspicious file to quarantine on an agent.",
                   Arrays.asList(
                       param("agentId",  "string", true, null, null),
                       param("filePath", "string", true, null, null)
                   )),

            action("run-script",         "Run Script on Endpoint",  "EDR",
                   "Execute a script on a remote endpoint via the EDR agent.",
                   Arrays.asList(
                       param("agentId", "string",  true,  null, null),
                       param("script",  "text",    true,  null, null),
                       param("timeout", "integer", false, 60,   null)
                   ))
        );
    }

    // -------------------------------------------------------------------------
    // Private builder helpers
    // -------------------------------------------------------------------------

    /**
     * Builds a {@link ResponseActionDTO} with {@code usageCount = 0}.
     *
     * @param id          stable kebab-case action identifier
     * @param name        human-readable display name (≤ 60 chars)
     * @param category    one of: EDR | Network | Identity | Ticketing | Integration | Notification
     * @param description human-readable description (≤ 240 chars)
     * @param params      ordered list of parameter definitions
     */
    private ResponseActionDTO action(String id,
                                     String name,
                                     String category,
                                     String description,
                                     List<ResponseActionParamDTO> params) {
        ResponseActionDTO dto = new ResponseActionDTO();
        dto.setId(id);
        dto.setName(name);
        dto.setCategory(category);
        dto.setDescription(description);
        dto.setParams(params);
        dto.setUsageCount(0);
        return dto;
    }

    /**
     * Builds a {@link ResponseActionParamDTO} for non-select types.
     *
     * @param name         camelCase parameter name
     * @param type         one of: string | integer | text | boolean
     * @param required     whether this parameter is mandatory
     * @param defaultValue optional default value (null = no default); runtime type must match {@code type}
     * @param helpText     optional help text shown in the UI (null = none)
     */
    private ResponseActionParamDTO param(String name,
                                         String type,
                                         boolean required,
                                         Object defaultValue,
                                         String helpText) {
        ResponseActionParamDTO dto = new ResponseActionParamDTO();
        dto.setName(name);
        dto.setType(type);
        dto.setRequired(required);
        dto.setDefaultValue(defaultValue);
        dto.setOptions(null);
        return dto;
    }

    /**
     * Builds a {@link ResponseActionParamDTO} for {@code type = "select"} parameters.
     *
     * @param name         camelCase parameter name
     * @param required     whether this parameter is mandatory
     * @param defaultValue default option string; must be one of {@code options}
     * @param options      non-empty list of allowed option strings
     */
    private ResponseActionParamDTO paramSelect(String name,
                                               boolean required,
                                               String defaultValue,
                                               List<String> options) {
        ResponseActionParamDTO dto = new ResponseActionParamDTO();
        dto.setName(name);
        dto.setType("select");
        dto.setRequired(required);
        dto.setDefaultValue(defaultValue);
        dto.setOptions(options);
        return dto;
    }
}
