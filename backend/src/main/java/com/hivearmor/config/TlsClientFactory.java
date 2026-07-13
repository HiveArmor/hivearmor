package com.hivearmor.config;

import okhttp3.OkHttpClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.util.concurrent.TimeUnit;

public final class TlsClientFactory {

    private static final Logger log = LoggerFactory.getLogger(TlsClientFactory.class);

    private TlsClientFactory() {}

    /**
     * Builds an OkHttpClient that validates the server certificate against the
     * CA cert at ELASTICSEARCH_CA_CERT. Falls back to JVM defaults when unset.
     */
    public static OkHttpClient buildOkHttpClient() {
        return buildOkHttpClient(0, 0, 0);
    }

    /**
     * Like {@link #buildOkHttpClient()} but with explicit timeouts (seconds, 0 = OkHttp default).
     */
    public static OkHttpClient buildOkHttpClient(long connectTimeoutSec, long writeTimeoutSec, long readTimeoutSec) {
        String caCertPath = System.getenv(Constants.ENV_ELASTICSEARCH_CA_CERT);
        OkHttpClient.Builder builder = new OkHttpClient.Builder();
        if (connectTimeoutSec > 0) builder.connectTimeout(connectTimeoutSec, TimeUnit.SECONDS);
        if (writeTimeoutSec > 0)   builder.writeTimeout(writeTimeoutSec, TimeUnit.SECONDS);
        if (readTimeoutSec > 0)    builder.readTimeout(readTimeoutSec, TimeUnit.SECONDS);

        if (caCertPath == null || caCertPath.isBlank()) {
            log.warn("ELASTICSEARCH_CA_CERT not set — using JVM default trust store (may fail with self-signed certs)");
            return builder.build();
        }
        try {
            KeyStore ks = loadPemCaKeyStore(caCertPath);
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                    TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(ks);
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, tmf.getTrustManagers(), null);
            X509TrustManager trustManager = (X509TrustManager) tmf.getTrustManagers()[0];
            return builder
                    .sslSocketFactory(sslContext.getSocketFactory(), trustManager)
                    .build();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to build TLS client from CA cert at " + caCertPath, e);
        }
    }

    /**
     * Returns an SSLContext loaded from the CA cert at ELASTICSEARCH_CA_CERT,
     * for use with Apache HttpClient (RestTemplate). Falls back to JVM defaults.
     */
    public static SSLContext buildSslContext() {
        String caCertPath = System.getenv(Constants.ENV_ELASTICSEARCH_CA_CERT);
        if (caCertPath == null || caCertPath.isBlank()) {
            log.warn("ELASTICSEARCH_CA_CERT not set — using JVM default SSL context");
            try {
                return SSLContext.getDefault();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
        try {
            KeyStore ks = loadPemCaKeyStore(caCertPath);
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                    TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(ks);
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, tmf.getTrustManagers(), null);
            return ctx;
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to build SSL context from CA cert at " + caCertPath, e);
        }
    }

    /**
     * Returns an X509TrustManager that trusts the CA cert at ELASTICSEARCH_CA_CERT.
     * Used by gRPC Netty channel builder (and any other consumer that needs a raw trust manager).
     * Falls back to JVM defaults when the env var is unset.
     */
    public static X509TrustManager buildX509TrustManager() {
        String caCertPath = System.getenv(Constants.ENV_ELASTICSEARCH_CA_CERT);
        if (caCertPath == null || caCertPath.isBlank()) {
            log.warn("ELASTICSEARCH_CA_CERT not set — gRPC channel will use JVM default trust store");
            try {
                TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
                tmf.init((KeyStore) null);
                for (javax.net.ssl.TrustManager tm : tmf.getTrustManagers()) {
                    if (tm instanceof X509TrustManager) return (X509TrustManager) tm;
                }
                throw new IllegalStateException("No X509TrustManager in JVM default trust store");
            } catch (Exception e) {
                throw new IllegalStateException("Failed to build default X509TrustManager", e);
            }
        }
        try {
            KeyStore ks = loadPemCaKeyStore(caCertPath);
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(ks);
            for (javax.net.ssl.TrustManager tm : tmf.getTrustManagers()) {
                if (tm instanceof X509TrustManager) return (X509TrustManager) tm;
            }
            throw new IllegalStateException("No X509TrustManager found after loading CA cert");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build X509TrustManager from CA cert at " + caCertPath, e);
        }
    }

    // Loads a PEM CA cert file into a KeyStore.
    private static KeyStore loadPemCaKeyStore(String caCertPath) throws Exception {
        try (InputStream caInput = new FileInputStream(caCertPath)) {
            Certificate ca = CertificateFactory.getInstance("X.509").generateCertificate(caInput);
            KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
            ks.load(null, null);
            ks.setCertificateEntry("ca", ca);
            return ks;
        }
    }
}
