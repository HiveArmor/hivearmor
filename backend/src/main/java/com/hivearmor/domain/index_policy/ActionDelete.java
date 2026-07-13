package com.hivearmor.domain.index_policy;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;

/**
 * Deletes a managed index.
 * Must serialize as {} (empty object) for the OpenSearch ISM API.
 */
@JsonSerialize(using = EmptyObjectSerializer.class)
public class ActionDelete {
}
