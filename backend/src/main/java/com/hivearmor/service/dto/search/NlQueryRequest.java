package com.hivearmor.service.dto.search;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class NlQueryRequest {

    @NotBlank(message = "question is required")
    @Size(max = 2000, message = "question must be 2000 characters or fewer")
    private String question;

    private String indexPattern;

    private SchemaHint schema;

    @Data
    public static class SchemaHint {
        private List<String> fields;
    }
}
