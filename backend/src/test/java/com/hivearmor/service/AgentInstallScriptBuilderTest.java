package com.hivearmor.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AgentInstallScriptBuilderTest {

    @Test
    void bashScriptUsesEnrollmentTokenFileAndSameOriginPackagePath() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildBashScript(
            "siem.example", "web-01", "ha_enroll_test.secret", "edr", "tomorrow", true);

        assertThat(script).contains("https://${SERVER}/agent-packages/${BINARY}");
        assertThat(script).contains("https://${SERVER}:9001/private/dependencies/agent/${BINARY}");
        assertThat(script).contains("curl -fsSL -k");
        assertThat(script).contains("--enrollment-token-file -");
        assertThat(script).contains("echo \"$TOKEN\" | sudo \"$DEST\" install \"$SERVER\" \"$INSECURE\"");
        assertThat(script).doesNotContain("install \"$SERVER\" \"$KEY\"");
        assertThat(script).doesNotContain("install \"$SERVER\" \"ha_enroll_test.secret\"");
    }

    @Test
    void powershellScriptUsesEnrollmentTokenFileAndProtectedTempFile() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildPowerShellScript(
            "siem.example", "web-01", "ha_enroll_test.secret", "edr", "tomorrow", false);

        assertThat(script).contains("--enrollment-token-file -");
        assertThat(script).contains("Get-Content -Raw $TokenFile | & $Dest install $Server $SkipCert");
        assertThat(script).contains("icacls $TokenFile");
        assertThat(script).doesNotContain("install $Server $Key");
        assertThat(script).doesNotContain("install $Server ha_enroll_test.secret");
    }

    @Test
    void escapeBashDoubleQuotedEscapesSpecialCharacters() {
        assertThat(AgentInstallScriptBuilder.escapeBashDoubleQuoted("a\"b$c`d\\e"))
            .isEqualTo("a\\\"b\\$c\\`d\\\\e");
    }

    @Test
    void escapePowerShellDoubleQuotedEscapesSpecialCharacters() {
        assertThat(AgentInstallScriptBuilder.escapePowerShellDoubleQuoted("a\"b$c`d"))
            .isEqualTo("a`\"b`$c``d");
    }
}
