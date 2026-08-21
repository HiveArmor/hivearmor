package com.hivearmor.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AgentInstallScriptBuilderTest {

    @Test
    void bashScriptPrefersSameOriginPackagePath() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildBashScript("siem.example", "web-01", "once-key", "edr", "tomorrow", true);
        assertThat(script).contains("https://${SERVER}/agent-packages/${BINARY}");
        assertThat(script).contains("https://${SERVER}:9001/private/dependencies/agent/${BINARY}");
        assertThat(script).contains("curl -fsSL -k");
    }
}
