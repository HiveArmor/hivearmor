package com.hivearmor.service.export;

/**
 * Supported forensic export formats (B0-4).
 */
public enum ExportFormat {
    /** RFC-4180 tabular CSV (column-projected). */
    CSV,
    /** Newline-delimited JSON — one raw normalized document per line (forensic fidelity). */
    NDJSON;

    /**
     * Parses a client-supplied format token, case-insensitively.
     *
     * @param raw the {@code format} field from the request body
     * @return the matching {@link ExportFormat}
     * @throws IllegalArgumentException if the token is null/blank or not a known format
     */
    public static ExportFormat parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Missing export format; expected 'csv' or 'ndjson'");
        }
        String normalized = raw.trim().toLowerCase();
        switch (normalized) {
            case "csv":
                return CSV;
            case "ndjson":
                return NDJSON;
            default:
                throw new IllegalArgumentException(
                    "Unknown export format '" + raw + "'; expected 'csv' or 'ndjson'");
        }
    }

    public String contentType() {
        return this == CSV ? "text/csv" : "application/x-ndjson";
    }

    public String fileExtension() {
        return this == CSV ? "csv" : "ndjson";
    }
}
