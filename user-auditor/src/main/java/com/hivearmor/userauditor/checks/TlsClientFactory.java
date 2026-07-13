package com.hivearmor.userauditor.checks;

import com.hivearmor.userauditor.service.elasticsearch.Constants;
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

final class TlsClientFactory {

    private static final Logger log = LoggerFactory.getLogger(TlsClientFactory.class);

    private TlsClientFactory() {}

    /**
     * Builds an OkHttpClient that validates the server certificate against the
     * CA cert at ELASTICSEARCH_CA_CERT. Falls back to JVM defaults when unset.
     */
    static OkHttpClient buildOkHttpClient() {
        String caCertPath = System.getenv(Constants.ENV_ELASTICSEARCH_CA_CERT);
        if (caCertPath == null || caCertPath.isBlank()) {
            log.warn("ELASTICSEARCH_CA_CERT not set — using JVM default trust store (may fail with self-signed certs)");
            return new OkHttpClient.Builder().build();
        }
        try (InputStream caInput = new FileInputStream(caCertPath)) {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            Certificate ca = cf.generateCertificate(caInput);

            KeyStore keyStore = KeyStore.getInstance(KeyStore.getDefaultType());
            keyStore.load(null, null);
            keyStore.setCertificateEntry("ca", ca);

            TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                    TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(keyStore);

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, tmf.getTrustManagers(), null);

            X509TrustManager trustManager = (X509TrustManager) tmf.getTrustManagers()[0];

            return new OkHttpClient.Builder()
                    .sslSocketFactory(sslContext.getSocketFactory(), trustManager)
                    .build();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to build TLS client from CA cert at " + caCertPath, e);
        }
    }
}
