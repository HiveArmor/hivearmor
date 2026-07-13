package com.hivearmor.service.dto.correlation;

import com.hivearmor.domain.correlation.rules.SearchRequest;
import com.hivearmor.domain.shared_types.alert.Impact;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuleYaml {
    private Long id;
    private List<String> dataTypes;
    private String name;
    private Impact impact;
    private String category;
    private String technique;
    private AdversaryType adversary;
    private String description;
    private List<String> references;
    private String where;
    private List<SearchRequest> afterEvents;
    private List<String> groupBy;
    private List<String> deduplicateBy;
}
