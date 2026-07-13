package com.hivearmor.service.elasticsearch.processor;

import java.util.List;
import java.util.Map;

public class NoOpProcessor implements SearchResultProcessor {
    @Override
    public List<Map<String, Object>> process(List<Map<String, Object>> rawResults) {
        return rawResults;
    }
}

