package com.hivearmor.util;

import org.springframework.data.domain.Sort;

import java.util.Set;

public final class SqlSortValidator {

    private SqlSortValidator() {}

    public static Sort validateAndFilter(Sort sort, Set<String> allowedColumns) {
        if (sort.isUnsorted()) return sort;
        var validOrders = sort.stream()
            .filter(o -> allowedColumns.contains(o.getProperty()))
            .toList();
        return validOrders.isEmpty() ? Sort.unsorted() : Sort.by(validOrders);
    }
}
