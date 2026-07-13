package com.hivearmor.service.dto.visualization;

import com.hivearmor.domain.chart_builder.types.ChartType;
import com.hivearmor.domain.chart_builder.types.aggregation.AggregationType;
import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.index_pattern.UtmIndexPattern;
import com.hivearmor.service.dto.visualization.enums.QueryLanguageEnum;
import com.hivearmor.validation.elasticsearch.SqlSelectOnly;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UtmVisualizationDto {
    private Long id;
    private String name;
    private String description;
    private String eventType;
    private Instant createdDate;
    private Instant modifiedDate;
    private String userCreated;
    private String userModified;
    private String chartConfig;
    private String chartAction;
    private Boolean systemOwner;
    private Long idPattern;
    private UtmIndexPattern pattern;
    private ChartType chartType;
    private String query;
    @SqlSelectOnly
    private String sqlQuery;
    private List<FilterType> filterType;
    private AggregationType aggregationType;
    private QueryLanguageEnum queryLanguage;
}

