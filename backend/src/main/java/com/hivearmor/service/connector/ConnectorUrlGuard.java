package com.hivearmor.service.connector;

import java.net.InetAddress;
import java.net.URI;
import java.util.Locale;

/**
 * SSRF guard for connector base URLs (same posture as playbook webhooks).
 */
public final class ConnectorUrlGuard {

    private ConnectorUrlGuard() {
    }

    public static URI requireHttpsUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("Base URL is required");
        }
        URI uri = URI.create(url.trim());
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        if (!"https".equals(scheme)) {
            throw new IllegalArgumentException("Connector base URL must use https");
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("Connector base URL host is required");
        }
        assertHostSafe(uri.getHost());
        return uri;
    }

    static void assertHostSafe(String host) {
        try {
            String h = host.trim().toLowerCase(Locale.ROOT);
            if ("localhost".equals(h) || h.endsWith(".localhost") || h.endsWith(".local")
                || "metadata.google.internal".equals(h)
                || "metadata".equals(h)) {
                throw new IllegalArgumentException("Connector host is not allowed");
            }
            InetAddress[] addrs = InetAddress.getAllByName(h);
            for (InetAddress addr : addrs) {
                if (addr.isAnyLocalAddress()
                    || addr.isLoopbackAddress()
                    || addr.isLinkLocalAddress()
                    || addr.isSiteLocalAddress()
                    || addr.isMulticastAddress()) {
                    throw new IllegalArgumentException("Connector host resolves to a private/reserved address");
                }
                String ip = addr.getHostAddress();
                if (ip.startsWith("169.254.") || ip.equals("::1") || ip.startsWith("fc") || ip.startsWith("fd")) {
                    throw new IllegalArgumentException("Connector host resolves to a reserved address");
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Connector host could not be validated: " + e.getMessage());
        }
    }
}
