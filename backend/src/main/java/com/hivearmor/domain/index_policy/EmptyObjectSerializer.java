package com.hivearmor.domain.index_policy;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;

import java.io.IOException;

/**
 * Serializes any object as an empty JSON object {}.
 * Used for OpenSearch ISM action types (like delete) that take no parameters.
 */
public class EmptyObjectSerializer extends StdSerializer<Object> {

    public EmptyObjectSerializer() {
        super(Object.class);
    }

    @Override
    public void serialize(Object value, JsonGenerator gen, SerializerProvider provider) throws IOException {
        gen.writeStartObject();
        gen.writeEndObject();
    }
}
