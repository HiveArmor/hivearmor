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
    void powershellScriptUsesProtectedTokenFileAndElevatedInstall() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildPowerShellScript(
            "siem.example", "web-01", "ha_enroll_test.secret", "edr", "tomorrow", false);

        assertThat(script).contains("--enrollment-token-file', $TokenFile, '--mode', $Mode)");
        assertThat(script).contains("Start-Process -FilePath $Dest -ArgumentList $installArgs -Wait -PassThru");
        assertThat(script).contains("Unblock-File -Path $Dest");
        assertThat(script).contains("[System.IO.File]::WriteAllText($TokenFile, $Token, $utf8NoBom)");
        assertThat(script).contains("SecurityIdentifier 'S-1-5-32-544'");
        assertThat(script).contains("-ExecutionPolicy', 'Bypass'");
        assertThat(script).doesNotContain("Get-Content -Raw $TokenFile |");
        assertThat(script).doesNotContain("install $Server ha_enroll_test.secret");
        assertThat(script).contains("($env:USERNAME + ':(R,W)')");
        assertThat(script).doesNotContain("\"$($env:USERNAME):(R,W)\"");
        assertThat(script).doesNotContain("Write-Error (\"Download failed");
    }

    @Test
    void powershellScriptAvoidsParenthesesInConcatenatedErrorStrings() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildPowerShellScript(
            "72.44.52.187", "web-01", "ha_enroll_test.secret", "edr", "tomorrow", true);

        assertThat(script).contains("Write-Error \"Download failed from both $Url and $Fallback.");
        assertThat(script).doesNotContain("+ \"(the server");
    }

    @Test
    void powershellScriptEnablesTlsBypassForInsecureHosts() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildPowerShellScript(
            "72.44.52.187", "web-01", "ha_enroll_test.secret", "edr", "tomorrow", true);

        assertThat(script).contains("$SkipCert = \"yes\"");
        assertThat(script).contains("class HaTrustAllCerts");
        assertThat(script).contains("[HaTrustAllCerts]::Enable()");
        assertThat(script).contains("Download-HiveArmorPackage");
        assertThat(script).contains("System.Net.WebClient");
    }

    @Test
    void powershellScriptEscapesSpecialCharactersInTokenAndServer() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildPowerShellScript(
            "host\"$`1.example", "web-01", "ha_enroll_\"$`tok.en", "edr", "tomorrow", false);

        assertThat(script).contains("$Server  = \"host`\"`$``1.example\"");
        assertThat(script).contains("$Token   = \"ha_enroll_`\"`$``tok.en\"");
        assertThat(script).doesNotContain("$Server  = \"host\"$`1.example\"");
    }

    @Test
    void powershellScriptDetectsArm64FromProcessorArchitecture() {
        AgentInstallScriptBuilder builder = new AgentInstallScriptBuilder();
        String script = builder.buildPowerShellScript(
            "siem.example", "web-01", "ha_enroll_test.secret", "edr", "tomorrow", false);

        assertThat(script).contains("$Arch = if ($env:PROCESSOR_ARCHITECTURE -match 'ARM64') { 'arm64' } else { 'amd64' }");
        assertThat(script).doesNotContain("Is64BitOperatingSystem");
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
