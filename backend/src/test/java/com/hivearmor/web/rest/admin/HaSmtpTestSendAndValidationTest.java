package com.hivearmor.web.rest.admin;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.domain.mail_sender.MailConfig;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.MailService;
import com.hivearmor.service.admin.HaSystemSettingsService;
import com.hivearmor.service.dto.admin.SmtpTestResultDTO;
import com.hivearmor.service.dto.admin.SystemSettingsEmailDTO;
import com.hivearmor.service.dto.admin.SystemSettingsSecurityDTO;
import com.hivearmor.util.crypto.HaCipherUtil;
import jakarta.mail.MessagingException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the B0-2 SMTP test-send behaviour and the system-settings DTO
 * validation constraints.
 *
 * <p><strong>Covers (B0-2 §4, §5):</strong>
 * <ul>
 *   <li>{@link HaSystemSettingsService#sendTestEmail(String)} returns
 *       {@code ok=false} with a sanitized error when the underlying mail sender
 *       throws, and that error never contains the plaintext SMTP password.</li>
 *   <li>The General/Email/Security DTO jakarta.validation constraints reject
 *       out-of-range {@code port}, {@code sessionTimeoutMinutes}, and
 *       {@code passwordMinLength} values.</li>
 * </ul>
 *
 * <p>The Spring context is bypassed: the service is constructed directly with
 * mocked collaborators, and a standalone {@link Validator} is used for the DTO
 * constraint assertions.
 */
class HaSmtpTestSendAndValidationTest {

    /** The distinctive plaintext password we assert is never leaked. */
    private static final String SECRET_PASSWORD = "SuperSecretSmtpPw!12345";

    private static Validator validator;

    private UtmConfigurationParameterRepository configRepo;
    private HaCipherUtil cipher;
    private MailService mailService;
    private HaSystemSettingsService service;

    @BeforeAll
    static void initValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDownValidator() {
        // Validator factory closes with the JVM; nothing to release explicitly.
    }

    @BeforeEach
    void setUp() {
        configRepo  = mock(UtmConfigurationParameterRepository.class);
        cipher      = mock(HaCipherUtil.class);
        mailService = mock(MailService.class);
        service     = new HaSystemSettingsService(configRepo, cipher, mailService);
    }

    // =========================================================================
    // SMTP test-send — failure path (B0-2 §4)
    // =========================================================================

    @Test
    void sendTestEmail_returnsOkFalse_andNeverLeaksPassword_whenSenderThrows() throws Exception {
        // Persisted SMTP rows: a configured host + an encrypted password blob.
        List<UtmConfigurationParameter> rows = new ArrayList<>();
        rows.add(param("hivearmor.smtp.host", "smtp.example.com"));
        rows.add(param("hivearmor.smtp.port", "587"));
        rows.add(param("hivearmor.smtp.username", "mailer"));
        rows.add(param("hivearmor.smtp.password", "ENC(cipher-blob)"));
        rows.add(param("hivearmor.smtp.from", "noreply@example.com"));
        rows.add(param("hivearmor.smtp.useTls", "true"));
        when(configRepo.findAll()).thenReturn(rows);

        // The stored blob decrypts to the secret plaintext password.
        when(cipher.decrypt("ENC(cipher-blob)")).thenReturn(SECRET_PASSWORD);

        // The sender fails, and the failure message deliberately embeds the password
        // to prove the sanitizer strips it. The message is also multi-line to prove
        // no stack-trace-like content is returned.
        MessagingException boom = new MessagingException(
            "Authentication failed for password=" + SECRET_PASSWORD + "\n\tat some.Frame(File.java:1)");
        doThrow(boom).when(mailService).sendCheckEmail(anyList(), any(MailConfig.class));

        SmtpTestResultDTO result = service.sendTestEmail("dest@example.com");

        assertThat(result.ok())
            .as("A throwing sender must produce ok=false")
            .isFalse();
        assertThat(result.error())
            .as("Failure must carry a non-null sanitized error")
            .isNotNull();
        assertThat(result.error())
            .as("The sanitized error must NEVER contain the plaintext SMTP password")
            .doesNotContain(SECRET_PASSWORD);
        assertThat(result.error())
            .as("The sanitized error must be single-line (no stack-trace content)")
            .doesNotContain("\n");
    }

    @Test
    void sendTestEmail_returnsOkTrue_whenSenderSucceeds() throws Exception {
        List<UtmConfigurationParameter> rows = new ArrayList<>();
        rows.add(param("hivearmor.smtp.host", "smtp.example.com"));
        rows.add(param("hivearmor.smtp.port", "587"));
        rows.add(param("hivearmor.smtp.password", "ENC(cipher-blob)"));
        rows.add(param("hivearmor.smtp.useTls", "true"));
        when(configRepo.findAll()).thenReturn(rows);
        when(cipher.decrypt("ENC(cipher-blob)")).thenReturn(SECRET_PASSWORD);
        // mailService.sendCheckEmail does nothing (void, no throw) → success.

        SmtpTestResultDTO result = service.sendTestEmail("dest@example.com");

        assertThat(result.ok()).isTrue();
        assertThat(result.error()).isNull();
    }

    @Test
    void sendTestEmail_returnsOkFalse_whenHostNotConfigured() {
        when(configRepo.findAll()).thenReturn(new ArrayList<>());

        SmtpTestResultDTO result = service.sendTestEmail("dest@example.com");

        assertThat(result.ok()).isFalse();
        assertThat(result.error()).isNotNull();
    }

    // =========================================================================
    // DTO validation — out-of-range rejection (B0-2 §5)
    // =========================================================================

    @Test
    void emailDto_rejects_outOfRangePort() {
        SystemSettingsEmailDTO low = new SystemSettingsEmailDTO();
        low.setPort(0);
        low.setFrom("valid@example.com");
        assertThat(violationPaths(validator.validate(low)))
            .as("port=0 must violate @Min(1)")
            .contains("port");

        SystemSettingsEmailDTO high = new SystemSettingsEmailDTO();
        high.setPort(70000);
        high.setFrom("valid@example.com");
        assertThat(violationPaths(validator.validate(high)))
            .as("port=70000 must violate @Max(65535)")
            .contains("port");
    }

    @Test
    void emailDto_rejects_malformedFrom_butAcceptsValidPort() {
        SystemSettingsEmailDTO dto = new SystemSettingsEmailDTO();
        dto.setPort(587);
        dto.setFrom("not-an-email");
        assertThat(violationPaths(validator.validate(dto)))
            .as("a malformed from address must violate @Email")
            .contains("from");
    }

    @Test
    void securityDto_rejects_outOfRangeSessionTimeout() {
        SystemSettingsSecurityDTO low = new SystemSettingsSecurityDTO();
        low.setSessionTimeoutMinutes(4);   // below @Min(5)
        low.setPasswordMinLength(12);      // valid
        assertThat(violationPaths(validator.validate(low)))
            .as("sessionTimeoutMinutes=4 must violate @Min(5)")
            .contains("sessionTimeoutMinutes");

        SystemSettingsSecurityDTO high = new SystemSettingsSecurityDTO();
        high.setSessionTimeoutMinutes(1441); // above @Max(1440)
        high.setPasswordMinLength(12);
        assertThat(violationPaths(validator.validate(high)))
            .as("sessionTimeoutMinutes=1441 must violate @Max(1440)")
            .contains("sessionTimeoutMinutes");
    }

    @Test
    void securityDto_rejects_outOfRangePasswordMinLength() {
        SystemSettingsSecurityDTO low = new SystemSettingsSecurityDTO();
        low.setSessionTimeoutMinutes(60);  // valid
        low.setPasswordMinLength(7);       // below @Min(8)
        assertThat(violationPaths(validator.validate(low)))
            .as("passwordMinLength=7 must violate @Min(8)")
            .contains("passwordMinLength");

        SystemSettingsSecurityDTO high = new SystemSettingsSecurityDTO();
        high.setSessionTimeoutMinutes(60);
        high.setPasswordMinLength(129);    // above @Max(128)
        assertThat(violationPaths(validator.validate(high)))
            .as("passwordMinLength=129 must violate @Max(128)")
            .contains("passwordMinLength");
    }

    @Test
    void securityDto_accepts_inRangeValues() {
        SystemSettingsSecurityDTO dto = new SystemSettingsSecurityDTO();
        dto.setSessionTimeoutMinutes(60);
        dto.setPasswordMinLength(12);
        assertThat(validator.validate(dto))
            .as("in-range security settings must produce no violations")
            .isEmpty();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private static UtmConfigurationParameter param(String key, String value) {
        UtmConfigurationParameter p = new UtmConfigurationParameter();
        p.setSectionId(1L);
        p.setConfParamShort(key);
        p.setConfParamValue(value);
        return p;
    }

    private static <T> Set<String> violationPaths(Set<ConstraintViolation<T>> violations) {
        return violations.stream()
            .map(v -> v.getPropertyPath().toString())
            .collect(java.util.stream.Collectors.toSet());
    }
}
