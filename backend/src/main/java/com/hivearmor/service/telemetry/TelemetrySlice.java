package com.hivearmor.service.telemetry;

import java.util.List;

public record TelemetrySlice<T>(List<T> items, long total, String nextCursor, boolean hasMore) {
}
