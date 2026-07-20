package com.hivearmor.service.dto.search;

import com.fasterxml.jackson.annotation.JsonRawValue;
import lombok.Data;

import java.util.List;

@Data
public class NlQueryResultDTO {

    @JsonRawValue
    private String query;

    private String explanation;

    private List<SuggestedFilter> suggestedFilters;

    @Data
    public static class SuggestedFilter {
        private String field;
        private String value;
        private String label;
    }
}
