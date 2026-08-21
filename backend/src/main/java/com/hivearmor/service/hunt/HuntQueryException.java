package com.hivearmor.service.hunt;

/**
 * Stable client-facing validation failure raised while compiling a hunt query.
 */
public class HuntQueryException extends IllegalArgumentException {

    private final String code;
    private final int offset;

    public HuntQueryException(String code, String message, int offset) {
        super(message);
        this.code = code;
        this.offset = Math.max(offset, 0);
    }

    public String getCode() {
        return code;
    }

    public int getOffset() {
        return offset;
    }
}
