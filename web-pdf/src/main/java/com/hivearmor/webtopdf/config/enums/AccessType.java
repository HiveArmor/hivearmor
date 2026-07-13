package com.hivearmor.webtopdf.config.enums;

import lombok.Getter;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public enum AccessType {
    HA_TOKEN("Ha_Token", "?token=", "&url="),
    HA_INTERNAL_KEY("Ha_Internal_Key", "?key=", "&url=");

    @Getter
    private final String type;
    private final String accessType;
    private final String url;

    AccessType(String type, String accessType, String url) {
        this.type = type;
        this.accessType = accessType;
        this.url = url;
    }

    public String buildUrlPart(String accessKey, String route) {
        String encodedRoute = URLEncoder.encode(route, StandardCharsets.UTF_8);
        return accessType + accessKey + url + encodedRoute;
    }
}
