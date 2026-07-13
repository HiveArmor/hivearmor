package com.hivearmor.config;

import com.hivearmor.service.web_clients.rest_template.RestTemplateResponseErrorHandler;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.client5.http.ssl.SSLConnectionSocketFactoryBuilder;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.DefaultResponseErrorHandler;
import org.springframework.web.client.RestTemplate;

import javax.net.ssl.SSLContext;
import java.util.Objects;

/**
 * RestTemplate configuration.
 * Phase 6b: Migrated from Apache HttpClient 4 (org.apache.http.*) to
 * Apache HttpClient 5 (org.apache.hc.client5.*) — required by Spring Boot 3.x.
 */
@Configuration
public class RestTemplateConfiguration {
    public static final String CLASSNAME = "RestTemplateConfiguration";
    private final Logger log = LoggerFactory.getLogger(RestTemplateConfiguration.class);

    @Bean
    public RestTemplate restTemplate() {
        RestTemplate rest = new RestTemplate();
        rest.setErrorHandler(new RestTemplateResponseErrorHandler());
        return rest;
    }

    @Bean
    public RestTemplate restTemplateWithSsl() {
        RestTemplate rest = new RestTemplate();
        rest.setRequestFactory(Objects.requireNonNull(clientHttpRequestFactory()));
        rest.setErrorHandler(new RestTemplateResponseErrorHandler());
        return rest;
    }

    @Bean(name = "rawRestTemplate")
    public RestTemplate rawRestTemplate() {
        RestTemplate rest = new RestTemplate();
        rest.setErrorHandler(new DefaultResponseErrorHandler() {
            @Override
            public boolean hasError(@NotNull ClientHttpResponse response) {
                return false;
            }
        });
        return rest;
    }

    private HttpComponentsClientHttpRequestFactory clientHttpRequestFactory() {
        final String ctx = CLASSNAME + ".clientHttpRequestFactory";
        try {
            SSLContext sslContext = TlsClientFactory.buildSslContext();

            CloseableHttpClient httpClient = HttpClients.custom()
                    .setConnectionManager(
                            PoolingHttpClientConnectionManagerBuilder.create()
                                    .setSSLSocketFactory(
                                            SSLConnectionSocketFactoryBuilder.create()
                                                    .setSslContext(sslContext)
                                                    .build())
                                    .build())
                    .build();

            HttpComponentsClientHttpRequestFactory requestFactory =
                    new HttpComponentsClientHttpRequestFactory();
            requestFactory.setHttpClient(httpClient);
            return requestFactory;
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return null;
        }
    }
}
