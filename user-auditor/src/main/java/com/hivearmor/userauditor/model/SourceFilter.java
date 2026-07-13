package com.hivearmor.userauditor.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.*;

@Getter
@Setter
@Entity
@Table(name = "hive_source_filter")
public class SourceFilter extends Base {

    @ManyToOne
    @JoinColumn(name = "user_sources_id")
    @JsonIgnore
    private UserSource source;

    private String field;

    private String value;

    private int operator;

}
