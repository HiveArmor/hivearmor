package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * DTO matching the frontend ParserRuleDTO TypeScript interface (DataParsingPage).
 * id is serialised as String to match frontend expectation.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveParserRuleDTO {

    private String id;

    @NotBlank
    @Size(max = 200)
    private String name;

    @NotBlank
    private String dataType;
    /** active | inactive | error */
    private String status;
    private Long lastMatchedCount;
    private String yamlBody;
    private Instant createdAt;
    private Instant updatedAt;

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDataType() { return dataType; }
    public void setDataType(String dataType) { this.dataType = dataType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Long getLastMatchedCount() { return lastMatchedCount; }
    public void setLastMatchedCount(Long lastMatchedCount) { this.lastMatchedCount = lastMatchedCount; }

    public String getYamlBody() { return yamlBody; }
    public void setYamlBody(String yamlBody) { this.yamlBody = yamlBody; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
