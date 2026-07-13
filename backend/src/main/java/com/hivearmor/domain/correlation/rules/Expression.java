package com.hivearmor.domain.correlation.rules;

import lombok.Data;

@Data
public class Expression {
    private String field;
    private String operator;
    private Object value;
}
