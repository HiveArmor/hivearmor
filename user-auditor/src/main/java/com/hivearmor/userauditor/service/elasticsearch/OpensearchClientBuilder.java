package com.hivearmor.userauditor.service.elasticsearch;

import lombok.Getter;
import org.apache.hc.client5.http.auth.AuthScope;
import org.apache.hc.client5.http.auth.UsernamePasswordCredentials;
import org.apache.hc.client5.http.impl.auth.BasicCredentialsProvider;
import org.apache.hc.client5.http.impl.nio.PoolingAsyncClientConnectionManagerBuilder;
import org.apache.hc.client5.http.nio.AsyncClientConnectionManager;
import org.apache.hc.client5.http.ssl.DefaultClientTlsStrategy;
import org.apache.hc.client5.http.ssl.NoopHostnameVerifier;
import org.apache.hc.core5.http.HttpHost;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.transport.httpclient5.ApacheHttpClient5TransportBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.cert.X509Certificate;

@Service
public class OpensearchClientBuilder {
    private static final String CLASSNAME = "OpensearchClientBuilder";
    private final Logger log = LoggerFactory.getLogger(OpensearchClientBuilder.class);

    @Getter
    private OpenSearchClient client;

    @Order(Ordered.HIGHEST_PRECEDENCE)
    @EventListener(ApplicationReadyEvent.class)
    public void init() throws Exception {
        final String ctx = CLASSNAME + ".init";
        try {
            String host = System.getenv("ELASTICSEARCH_HOST");
            Assert.hasText(host, "Environment variable ELASTICSEARCH_HOST is missing or empty");

            String port = System.getenv("ELASTICSEARCH_PORT");
            Assert.hasText(port, "Environment variable ELASTICSEARCH_PORT is missing or empty");

            String user = System.getenv("ELASTICSEARCH_USER");
            Assert.hasText(user, "Environment variable ELASTICSEARCH_USER is missing or empty");

            String password = System.getenv("ELASTICSEARCH_PASSWORD");
            Assert.hasText(password, "Environment variable ELASTICSEARCH_PASSWORD is missing or empty");

            HttpHost httpHost = new HttpHost("https", host, Integer.parseInt(port));

            SSLContext trustAll = buildTrustAllSslContext();

            BasicCredentialsProvider credsProvider = new BasicCredentialsProvider();
            credsProvider.setCredentials(
                    new AuthScope(httpHost),
                    new UsernamePasswordCredentials(user, password.toCharArray()));

            final SSLContext finalSsl = trustAll;
            ApacheHttpClient5TransportBuilder transportBuilder =
                    ApacheHttpClient5TransportBuilder.builder(httpHost)
                            .setHttpClientConfigCallback(httpClientBuilder -> {
                                httpClientBuilder.setDefaultCredentialsProvider(credsProvider);
                                if (finalSsl != null) {
                                    try {
                                        AsyncClientConnectionManager cm =
                                                PoolingAsyncClientConnectionManagerBuilder.create()
                                                        .setTlsStrategy(new DefaultClientTlsStrategy(
                                                                finalSsl, NoopHostnameVerifier.INSTANCE))
                                                        .build();
                                        httpClientBuilder.setConnectionManager(cm);
                                    } catch (Exception ignored) {}
                                }
                                return httpClientBuilder;
                            })
                            .setMapper(new JacksonJsonpMapper());

            client = new OpenSearchClient(transportBuilder.build());

        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            throw new RuntimeException(msg);
        }
    }

    private SSLContext buildTrustAllSslContext() {
        try {
            TrustManager[] trustAll = new TrustManager[]{
                new X509TrustManager() {
                    public void checkClientTrusted(X509Certificate[] c, String a) {}
                    public void checkServerTrusted(X509Certificate[] c, String a) {}
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                }
            };
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, trustAll, new java.security.SecureRandom());
            return ctx;
        } catch (Exception e) {
            return null;
        }
    }
}
