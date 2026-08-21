package com.hivearmor.service.hunt;

import com.hivearmor.web.rest.hunt.dto.HuntFieldDefinitionDTO;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Canonical allowlist for fields exposed to Search &amp; Hunt.
 *
 * <p>The registry is deliberately narrower than the physical index mapping. It prevents
 * arbitrary field access and keeps query parsing, source projection, sorting, autocomplete,
 * and facet discovery aligned.
 */
@Component
public class HuntFieldRegistry {

    public enum FieldKind {
        KEYWORD, TEXT, IP, NUMBER, DATE, BOOLEAN
    }

    public record FieldSpec(
        String name,
        String label,
        FieldKind kind,
        String category,
        String description,
        boolean sortable,
        boolean aggregatable,
        boolean projectedByDefault
    ) {
        public List<String> operators() {
            return switch (kind) {
                case DATE, NUMBER -> List.of(":", "!=", ">", ">=", "<", "<=");
                case KEYWORD, IP, BOOLEAN -> List.of(":", "!=");
                case TEXT -> List.of(":", "!=");
            };
        }
    }

    private final Map<String, FieldSpec> fields;

    public HuntFieldRegistry() {
        Map<String, FieldSpec> registry = new LinkedHashMap<>();
        add(registry, "@timestamp", "Timestamp", FieldKind.DATE, "event", "Event occurrence time in UTC", true, true, true);
        add(registry, "ingestedAt", "Ingested at", FieldKind.DATE, "event", "Time the platform accepted the record", true, true, true);
        add(registry, "event.severity", "Severity", FieldKind.NUMBER, "event", "Normalized numeric event severity", true, true, true);
        add(registry, "event.category", "Category", FieldKind.KEYWORD, "event", "Normalized event category", true, true, true);
        add(registry, "event.action", "Action", FieldKind.KEYWORD, "event", "Normalized action performed", true, true, true);
        add(registry, "event.outcome", "Outcome", FieldKind.KEYWORD, "event", "Normalized action outcome", true, true, true);
        add(registry, "host.name", "Host", FieldKind.KEYWORD, "host", "Hostname of the observed system", true, true, true);
        add(registry, "host.ip", "Host IP", FieldKind.IP, "host", "IP address assigned to the host", true, true, false);
        add(registry, "host.os.name", "Host OS", FieldKind.KEYWORD, "host", "Operating system name", true, true, false);
        add(registry, "user.name", "User", FieldKind.KEYWORD, "identity", "User or service account name", true, true, true);
        add(registry, "user.domain", "User domain", FieldKind.KEYWORD, "identity", "Authentication domain", true, true, false);
        add(registry, "source.ip", "Source IP", FieldKind.IP, "network", "Source IPv4 or IPv6 address", true, true, true);
        add(registry, "source.port", "Source port", FieldKind.NUMBER, "network", "Source transport port", true, true, false);
        add(registry, "source.geo.country_name", "Source country", FieldKind.KEYWORD, "network", "Resolved source country", true, true, false);
        add(registry, "destination.ip", "Destination IP", FieldKind.IP, "network", "Destination IPv4 or IPv6 address", true, true, true);
        add(registry, "destination.port", "Destination port", FieldKind.NUMBER, "network", "Destination transport port", true, true, false);
        add(registry, "network.direction", "Network direction", FieldKind.KEYWORD, "network", "Normalized traffic direction", true, true, false);
        add(registry, "network.transport", "Transport", FieldKind.KEYWORD, "network", "Transport protocol", true, true, false);
        add(registry, "network.bytes", "Network bytes", FieldKind.NUMBER, "network", "Observed byte count", true, true, false);
        add(registry, "process.name", "Process", FieldKind.KEYWORD, "process", "Executable process name", true, true, false);
        add(registry, "process.command_line", "Command line", FieldKind.TEXT, "process", "Observed process command line", false, false, false);
        add(registry, "process.pid", "Process ID", FieldKind.NUMBER, "process", "Operating system process identifier", true, true, false);
        add(registry, "file.name", "File", FieldKind.KEYWORD, "file", "Observed file name", true, true, false);
        add(registry, "file.path", "File path", FieldKind.KEYWORD, "file", "Observed file path", true, true, false);
        add(registry, "file.hash.sha256", "SHA-256", FieldKind.KEYWORD, "file", "SHA-256 file hash", true, true, false);
        add(registry, "dataSource", "Data source", FieldKind.KEYWORD, "source", "Originating integration or collector", true, true, true);
        add(registry, "data_stream.dataset", "Dataset", FieldKind.KEYWORD, "source", "Normalized dataset identifier", true, true, true);
        add(registry, "message", "Message", FieldKind.TEXT, "event", "Human-readable event description", false, false, true);
        fields = Collections.unmodifiableMap(registry);
    }

    private static void add(Map<String, FieldSpec> registry, String name, String label, FieldKind kind,
                            String category, String description, boolean sortable,
                            boolean aggregatable, boolean projectedByDefault) {
        registry.put(name.toLowerCase(Locale.ROOT), new FieldSpec(
            name, label, kind, category, description, sortable, aggregatable, projectedByDefault));
    }

    public FieldSpec require(String name) {
        if (name == null) {
            throw new HuntQueryException("HUNT_FIELD_REQUIRED", "A field name is required", 0);
        }
        FieldSpec spec = fields.get(name.toLowerCase(Locale.ROOT));
        if (spec == null) {
            throw new HuntQueryException("HUNT_FIELD_UNSUPPORTED", "Unsupported hunt field: " + name, 0);
        }
        return spec;
    }

    public FieldSpec requireSortable(String name) {
        FieldSpec spec = require(name);
        if (!spec.sortable()) {
            throw new HuntQueryException("HUNT_FIELD_NOT_SORTABLE", "Field is not sortable: " + name, 0);
        }
        return spec;
    }

    public FieldSpec requireAggregatable(String name) {
        FieldSpec spec = require(name);
        if (!spec.aggregatable()) {
            throw new HuntQueryException("HUNT_FIELD_NOT_AGGREGATABLE", "Field cannot be used for value discovery: " + name, 0);
        }
        return spec;
    }

    public List<String> boundedProjection(Collection<String> requested) {
        Set<String> projection = new LinkedHashSet<>();
        fields.values().stream().filter(FieldSpec::projectedByDefault).map(FieldSpec::name).forEach(projection::add);
        if (requested != null) {
            if (requested.size() > 24) {
                throw new HuntQueryException("HUNT_PROJECTION_TOO_WIDE", "At most 24 additional fields may be requested", 0);
            }
            requested.stream().map(this::require).map(FieldSpec::name).forEach(projection::add);
        }
        return List.copyOf(projection);
    }

    public List<String> freeTextFields() {
        return List.of("message", "process.command_line", "host.name", "user.name", "file.path");
    }

    public List<HuntFieldDefinitionDTO> definitions() {
        List<HuntFieldDefinitionDTO> definitions = new ArrayList<>();
        for (FieldSpec field : fields.values()) {
            definitions.add(new HuntFieldDefinitionDTO(
                field.name(), field.label(), field.kind().name().toLowerCase(Locale.ROOT),
                field.category(), field.description(), field.operators()));
        }
        return Collections.unmodifiableList(definitions);
    }

    public Collection<FieldSpec> all() {
        return fields.values();
    }
}
