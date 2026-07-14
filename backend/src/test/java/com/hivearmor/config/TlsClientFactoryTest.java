package com.hivearmor.config;

import okhttp3.OkHttpClient;
import org.junit.jupiter.api.Test;

import javax.net.ssl.SSLContext;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TlsClientFactoryTest {

    // utm.crt is a self-signed cert already present in local-dev/certs/
    private static final String TEST_CERT_RESOURCE = "/test-certs/utm.crt";

    @Test
    void buildOkHttpClient_usesDefaultTrustStoreWhenEnvVarNotSet() {
        // ELASTICSEARCH_CA_CERT is not set in the test environment
        OkHttpClient client = TlsClientFactory.buildOkHttpClient();
        assertThat(client).isNotNull();
        assertThat(client.sslSocketFactory()).isNotNull();
    }

    @Test
    void buildOkHttpClient_withTimeouts_usesDefaultTrustStoreWhenEnvVarNotSet() {
        OkHttpClient client = TlsClientFactory.buildOkHttpClient(5, 5, 15);
        assertThat(client).isNotNull();
        assertThat(client.connectTimeoutMillis()).isEqualTo(5_000);
        assertThat(client.writeTimeoutMillis()).isEqualTo(5_000);
        assertThat(client.readTimeoutMillis()).isEqualTo(15_000);
    }

    @Test
    void buildOkHttpClient_loadsCustomCaCert() throws Exception {
        Path certFile = copyTestCertToTempFile();
        try {
            withEnv(Constants.ENV_ELASTICSEARCH_CA_CERT, certFile.toString(), () -> {
                OkHttpClient client = TlsClientFactory.buildOkHttpClient();
                assertThat(client).isNotNull();
                assertThat(client.sslSocketFactory()).isNotNull();
            });
        } finally {
            Files.deleteIfExists(certFile);
        }
    }

    @Test
    void buildOkHttpClient_throwsOnInvalidCertPath() {
        withEnv(Constants.ENV_ELASTICSEARCH_CA_CERT, "/nonexistent/path/ca.crt", () ->
            assertThatThrownBy(TlsClientFactory::buildOkHttpClient)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("/nonexistent/path/ca.crt")
        );
    }

    @Test
    void buildSslContext_returnsDefaultContextWhenEnvVarNotSet() {
        SSLContext ctx = TlsClientFactory.buildSslContext();
        assertThat(ctx).isNotNull();
        assertThat(ctx.getProtocol()).isEqualTo("Default");
    }

    @Test
    void buildSslContext_loadsCustomCaCert() throws Exception {
        Path certFile = copyTestCertToTempFile();
        try {
            withEnv(Constants.ENV_ELASTICSEARCH_CA_CERT, certFile.toString(), () -> {
                SSLContext ctx = TlsClientFactory.buildSslContext();
                assertThat(ctx).isNotNull();
                assertThat(ctx.getProtocol()).isEqualTo("TLS");
            });
        } finally {
            Files.deleteIfExists(certFile);
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    @FunctionalInterface
    interface ThrowingRunnable {
        void run() throws Exception;
    }

    // TlsClientFactory.resolveCaCertPath() checks System.getProperty as a fallback,
    // so tests set/clear a system property instead of mutating the process environment
    // (which is impossible without fragile reflection on Java 17+).
    private void withEnv(String key, String value, ThrowingRunnable action) {
        String previous = System.getProperty(key);
        System.setProperty(key, value);
        try {
            action.run();
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (previous == null) System.clearProperty(key);
            else System.setProperty(key, previous);
        }
    }

    private Path copyTestCertToTempFile() throws Exception {
        Path tmp = Files.createTempFile("test-ca", ".crt");
        InputStream is = getClass().getResourceAsStream(TEST_CERT_RESOURCE);
        if (is == null) {
            // Fallback: write a minimal self-signed cert inline so tests compile
            // even without the resource file. The cert is the utm.crt from local-dev.
            throw new IllegalStateException(
                "Test resource not found: " + TEST_CERT_RESOURCE +
                " — copy local-dev/certs/utm.crt to backend/src/test/resources/test-certs/utm.crt");
        }
        Files.copy(is, tmp, StandardCopyOption.REPLACE_EXISTING);
        return tmp;
    }
}
