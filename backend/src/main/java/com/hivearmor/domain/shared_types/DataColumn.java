package com.hivearmor.domain.shared_types;

import com.fasterxml.jackson.annotation.JsonCreator;

public class DataColumn {
    private String label;
    private String field;
    private String type;
    private boolean visible;
    private String customStyle;

    public DataColumn() {
    }

    /**
     * Deserialize a plain column-name string (e.g. {@code "@timestamp"}) into a DataColumn.
     * Clients such as Search &amp; Hunt / alert export send {@code columns: string[]}; Jackson uses
     * this delegating creator only for JSON string tokens, so object-form column JSON
     * ({@code {"field": "...", "label": "..."}}) still deserializes via the default bean path.
     */
    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static DataColumn fromField(String field) {
        DataColumn column = new DataColumn();
        column.field = field;
        column.label = field;
        column.visible = true;
        return column;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getField() {
        return field;
    }

    public void setField(String field) {
        this.field = field;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public boolean isVisible() {
        return visible;
    }

    public void setVisible(boolean visible) {
        this.visible = visible;
    }

    public String getCustomStyle() {
        return customStyle;
    }

    public void setCustomStyle(String customStyle) {
        this.customStyle = customStyle;
    }
}
