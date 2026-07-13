package com.hivearmor.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String frontendUrl = "http://localhost:4200";

    private final Redis redis = new Redis();
    private SecurityProperties security = new SecurityProperties();

    public String getFrontendUrl() { return frontendUrl; }
    public void setFrontendUrl(String frontendUrl) { this.frontendUrl = frontendUrl; }

    public Redis getRedis() { return redis; }

    public SecurityProperties getSecurity() { return security; }
    public void setSecurity(SecurityProperties security) { this.security = security; }

    public static class Redis {
        private boolean enabled = false;
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }

    public static class SecurityProperties {
        private List<String> trustedProxyCidrs = List.of();

        public List<String> getTrustedProxyCidrs() { return trustedProxyCidrs; }
        public void setTrustedProxyCidrs(List<String> cidrs) { this.trustedProxyCidrs = cidrs; }
    }
}
