package com.hivearmor.service.asset;

/** Stable client-facing validation failure for the canonical asset inventory API. */
public class AssetContractException extends IllegalArgumentException {

    private final String code;

    public AssetContractException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
