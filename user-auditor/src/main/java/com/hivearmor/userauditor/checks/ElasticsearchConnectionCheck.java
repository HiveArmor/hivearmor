package com.hivearmor.userauditor.checks;

import com.hivearmor.userauditor.service.elasticsearch.Constants;
import okhttp3.Credentials;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.util.Assert;

import java.util.Objects;

public class ElasticsearchConnectionCheck {
    private static final String CLASSNAME = "ElasticsearchConnectionCheck";

    public static ElasticsearchConnectionCheck getInstance() {
        return new ElasticsearchConnectionCheck();
    }

    public void connectionCheck(int retries) {
        final String ctx = CLASSNAME + ".connectionCheck";
        System.out.println(">> Checking elasticsearch connection:");
        do {
            try {
                pingElasticsearch();
                System.out.println("\t> Success");
                return;
            } catch (Exception e) {
                System.out.println("\t> Fail: " + ctx + ": " + e.getLocalizedMessage());
                if (retries == -1)
                    break;
                retries--;
                for (int i = 10; i > 0; i--) {
                    System.out.printf("\t> Retrying in: %1$s\r", i);
                    try {
                        Thread.sleep(1000L);
                    } catch (Exception ex) {
                        throw new RuntimeException(ctx + ": " + ex.getLocalizedMessage());
                    }
                }
            }
        } while (retries > 0);
        throw new RuntimeException("Fail to establish connection with elasticsearch");
    }

    private void pingElasticsearch() {
        final String ctx = CLASSNAME + ".pingElasticsearch";
        try {
            String elasticHost = System.getenv(Constants.ENV_ELASTICSEARCH_HOST);
            String elasticPort = System.getenv(Constants.ENV_ELASTICSEARCH_PORT);
            String user = System.getenv(Constants.ENV_ELASTICSEARCH_USER);
            String password = System.getenv(Constants.ENV_ELASTICSEARCH_PASSWORD);

            Assert.hasText(elasticHost, "Missing elasticsearch host configuration value");
            Assert.hasText(elasticPort, "Missing elasticsearch port configuration value");
            Assert.hasText(user, "Missing elasticsearch user configuration value");
            Assert.hasText(password, "Missing elasticsearch password configuration value");

            final String ELASTIC_URL = String.format("https://%1$s:%2$s", elasticHost, elasticPort);

            OkHttpClient client = createTrustAllClient();
            Request rq = new Request.Builder()
                .url(ELASTIC_URL)
                .header("Authorization", Credentials.basic(user, password))
                .build();
            Response rs = client.newCall(rq).execute();
            Objects.requireNonNull(rs.body()).close();
            if (!rs.isSuccessful())
                throw new RuntimeException("HTTP " + rs.code());
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    private OkHttpClient createTrustAllClient() {
        return TlsClientFactory.buildOkHttpClient();
    }
}
