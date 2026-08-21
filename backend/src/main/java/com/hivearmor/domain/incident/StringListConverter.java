package com.hivearmor.domain.incident;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * JPA AttributeConverter that serializes a {@code List<String>} to a
 * comma-separated TEXT column value and back.
 *
 * <p>An empty or null list is stored as an empty string so the column
 * satisfies the {@code DEFAULT ''} constraint from the Liquibase changeset.</p>
 */
@Converter
public class StringListConverter implements AttributeConverter<List<String>, String> {

    private static final String DELIMITER = ",";

    @Override
    public String convertToDatabaseColumn(List<String> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return "";
        }
        return attribute.stream()
                .collect(Collectors.joining(DELIMITER));
    }

    @Override
    public List<String> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.stream(dbData.split(DELIMITER, -1))
                .filter(s -> !s.isBlank())
                .collect(Collectors.toList());
    }
}
