# S05-T12: Replace Trust-All TLS Configurations with Proper Certificate Validation

**Sprint:** 5 (Reliability + Performance)
**Severity:** Critical
**Issue ID:** SEC-04
**Dependencies:** None
**Estimated time:** 4–6 hours

---

## Context

Three separate locations in the codebase disable TLS certificate validation entirely:

1. **`RestTemplateConfiguration.java`** — the `restTemplateWithSsl` bean uses `(chain, authType) -> true` as the `X509TrustManager` and `(hostname, session) -> true` as the hostname verifier. This bean is used for all outbound REST calls to Elasticsearch/OpenSearch from the backend.

2. **`agent-manager/utils/auth.go`** — `IsConnectionKeyValid()` builds an HTTP client with `tls.Config{InsecureSkipVerify: true}`. This function validates connection keys against the backend's `/api/authenticateFederationServiceManager` endpoint.

3. **`ElasticsearchConnectionCheck.java`** — `createTrustAllClient()` builds an OkHttpClient with a custom `X509TrustManager` that accepts all certificates and `(hostname, session) -> true` as the hostname verifier. This client is used both at startup (5-retry check) and at runtime (via `/api/healthcheck`).

The same `createTrustAllClient()` pattern is copy-pasted into two additional files that must also be fixed: `user-auditor/src/main/java/com/utmstack/userauditor/checks/ElasticsearchConnectionCheck.java` and `backend/src/main/java/com/nilachakra/opensearch/OpenSearch.java` (lines 97–112 and 180–193).

The project already generates a self-signed CA certificate at install time (`installer/utils/certs.go`, written to `{dataDir}/cert/ca.crt`). The agent-manager container already mounts this certificate at `/cert`. The backend and user-auditor containers do **not** currently mount the cert folder — that must be added as part of this fix.

The fix requires three coordinated changes: (a) mount the cert folder into the backend and user-auditor containers, (b) add an environment variable for the CA cert path, (c) replace each trust-all client builder with one that loads the CA cert.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/config/RestTemplateConfiguration.java` — full file. The trust-all code is at lines 68–70 (SSLContext) and line 78 (hostname verifier).
2. `/Users/encryptshell/GIT/UTMStack-11/agent-manager/utils/auth.go` — full file. `InsecureSkipVerify` at lines 12–14. Also read `agent-manager/agent/utmgrpc.go` lines 39–49 for the correct TLS pattern already used in this codebase.
3. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/checks/ElasticsearchConnectionCheck.java` — full file. `createTrustAllClient()` at lines 81–101.
4. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/opensearch/OpenSearch.java` — lines 90–120 and 175–200 (the two `createTrustAllClient()` invocations or inline trust-all blocks).
5. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/config/Constants.java` — the `ENV_*` constant declarations. You will add `ENV_ELASTICSEARCH_CA_CERT` here.
6. `/Users/encryptshell/GIT/UTMStack-11/installer/docker/compose.go` — find the backend service's volumes and environment blocks. You will add the cert mount and env var here.
7. `/Users/encryptshell/GIT/UTMStack-11/local-dev/docker-compose.yml` — the backend service definition for local development. Add cert mount here.
8. `/Users/encryptshell/GIT/UTMStack-11/installer/utils/certs.go` — confirms that `ca.crt` is written to `{dataDir}/cert/ca.crt` (the same folder already mounted into the agent-manager as `/cert`).

---

## Implementation Steps

### Step 1 — Add ENV constant for CA cert path

**File:** `backend/src/main/java/com/nilachakra/config/Constants.java`

Add alongside the existing `ENV_ELASTICSEARCH_*` constants:

```java
public static final String ENV_ELASTICSEARCH_CA_CERT = "ELASTICSEARCH_CA_CERT";
```

### Step 2 — Create a shared TLS utility class

Both `ElasticsearchConnectionCheck.java` and `OpenSearch.java` copy-paste the same trust-all pattern. Replace both with a shared utility that loads the CA cert correctly:

**File to create:** `backend/src/main/java/com/nilachakra/config/TlsClientFactory.java`

```java
package com.nilachakra.config;

import com.nilachakra.config.Constants;
import okhttp3.OkHttpClient;
import org.apache.http.ssl.SSLContexts;
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

/**
 * Builds TLS-validating HTTP clients using the CA certificate
 * specified by the ELASTICSEARCH_CA_CERT environment variable.
 *
 * Falls back to the JVM default trust store if the environment
 * variable is not set (e.g. in tests or local-dev without certs).
 */
public class TlsClientFactory {

    private static final Logger log = LoggerFactory.getLogger(TlsClientFactory.class);

    /**
     * Builds an OkHttpClient that validates the server certificate
     * against the configured CA cert.
     */
    public static OkHttpClient buildOkHttpClient() {
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

            X509TrustManager trustManager =
                    (X509TrustManager) tmf.getTrustManagers()[0];

            return new OkHttpClient.Builder()
                    .sslSocketFactory(sslContext.getSocketFactory(), trustManager)
                    // no hostnameVerifier override — use the default, which validates hostname
                    .build();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to build TLS client from CA cert at " + caCertPath, e);
        }
    }

    /**
     * Returns an SSLContext loaded from the configured CA cert,
     * for use with Apache HttpClient (RestTemplate).
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
            return SSLContexts.custom()
                    .loadTrustMaterial(
                            new java.io.File(caCertPath),
                            null  // no password for CA cert
                    )
                    .build();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to build SSL context from CA cert at " + caCertPath, e);
        }
    }
}
```

### Step 3 — Fix RestTemplateConfiguration.java

**File:** `backend/src/main/java/com/nilachakra/config/RestTemplateConfiguration.java`

Replace `clientHttpRequestFactory()` (lines 60–85):

```java
@Bean
public CloseableHttpClient clientHttpRequestFactory() {
    SSLContext sslContext = TlsClientFactory.buildSslContext();
    SSLConnectionSocketFactory sslSocketFactory =
            SSLConnectionSocketFactoryBuilder.create()
                    .setSslContext(sslContext)
                    // remove: .setHostnameVerifier((hostname, session) -> true)
                    // DefaultHostnameVerifier is used automatically
                    .build();
    HttpClientConnectionManager connectionManager =
            PoolingHttpClientConnectionManagerBuilder.create()
                    .setSSLSocketFactory(sslSocketFactory)
                    .build();
    return HttpClients.custom()
            .setConnectionManager(connectionManager)
            .build();
}
```

Remove the import for `TrustAllStrategy` or any `X509TrustManager` lambda that was previously in this file.

### Step 4 — Fix ElasticsearchConnectionCheck.java

**File:** `backend/src/main/java/com/nilachakra/checks/ElasticsearchConnectionCheck.java`

Replace `createTrustAllClient()` (lines 81–101) with:

```java
private OkHttpClient createTrustAllClient() {
    return TlsClientFactory.buildOkHttpClient();
}
```

Apply the same replacement to:
- `user-auditor/src/main/java/com/utmstack/userauditor/checks/ElasticsearchConnectionCheck.java`
- `backend/src/main/java/com/nilachakra/opensearch/OpenSearch.java` (both occurrences at lines 97–112 and 180–193)
- `backend/src/main/java/com/nilachakra/service/soc_ai/SocAIService.java` (lines 73–88)

### Step 5 — Fix agent-manager/utils/auth.go

**File:** `agent-manager/utils/auth.go`

Replace the `InsecureSkipVerify` block (lines 12–14):

```go
import (
    "crypto/tls"
    "crypto/x509"
    "net/http"
    "os"
)

func buildTLSClient() (*http.Client, error) {
    caCertPath := "/cert/ca.crt"
    caCert, err := os.ReadFile(caCertPath)
    if err != nil {
        // Fall back to system defaults if cert file is absent
        // (e.g. local dev without cert volume)
        return &http.Client{}, nil
    }
    certPool := x509.NewCertPool()
    if !certPool.AppendCertsFromPEM(caCert) {
        return nil, fmt.Errorf("failed to append CA cert from %s", caCertPath)
    }
    tlsConfig := &tls.Config{RootCAs: certPool}
    transport := &http.Transport{TLSClientConfig: tlsConfig}
    return &http.Client{Transport: transport}, nil
}

func IsConnectionKeyValid(url, key string) (bool, error) {
    client, err := buildTLSClient()
    if err != nil {
        return false, err
    }
    // ... rest of function unchanged
}
```

The cert path `/cert/ca.crt` is already available in the agent-manager container (the volume mount exists in both `installer/docker/compose.go` and `local-dev/docker-compose.yml`).

### Step 6 — Mount cert volume into backend and user-auditor containers

**File:** `installer/docker/compose.go`

Find the backend service definition and add:
- Volume: `stack.Cert + ":/cert:ro"` (same pattern as agent-manager)
- Environment: `"ELASTICSEARCH_CA_CERT=/cert/ca.crt"`

Do the same for the user-auditor service if it exists in compose.go.

**File:** `local-dev/docker-compose.yml`

Under the `backend:` service, add:
```yaml
    volumes:
      - ./certs:/cert:ro
    environment:
      - ELASTICSEARCH_CA_CERT=/cert/ca.crt
```

**Note on local-dev certs:** The `local-dev/certs/` directory currently contains only `utm.crt` and `utm.key`. You must also generate or copy `ca.crt` into that folder. The simplest approach for local dev: generate a self-signed CA:

```bash
openssl genrsa -out local-dev/certs/ca.key 4096
openssl req -new -x509 -days 3650 -key local-dev/certs/ca.key \
  -out local-dev/certs/ca.crt -subj "/CN=ArmorSight-Dev-CA"
```

Then re-generate `utm.crt` signed by that CA (or configure OpenSearch to use it). Alternatively, for local dev only, keep the `ELASTICSEARCH_CA_CERT` env var unset; `TlsClientFactory.buildOkHttpClient()` and `buildSslContext()` fall back to JVM defaults with a warning log, preventing startup failures in dev without real certs.

---

## Test Commands

```bash
# Java backend
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile
./mvnw test -Dtest=TlsClientFactoryTest,RestTemplateConfigurationTest,ElasticsearchConnectionCheckTest

# Full suite
./mvnw test

# Go agent-manager
cd /Users/encryptshell/GIT/UTMStack-11/agent-manager
go build ./...
go test ./utils/... -v
go test ./... -race
go vet ./...

# Verify no InsecureSkipVerify or trust-all lambdas remain:
grep -rn "InsecureSkipVerify\s*:\s*true" \
  /Users/encryptshell/GIT/UTMStack-11/agent-manager/ \
  /Users/encryptshell/GIT/UTMStack-11/plugins/
grep -rn "(chain, authType) -> true\|(hostname, session) -> true\|TrustAllStrategy\|trustAllCerts" \
  /Users/encryptshell/GIT/UTMStack-11/backend/src/
# Both grep commands must return zero results.
```

Write this test in `backend/src/test/java/com/nilachakra/config/TlsClientFactoryTest.java`:

```java
class TlsClientFactoryTest {

    @Test
    void buildOkHttpClient_usesDefaultTrustStoreWhenEnvVarNotSet() {
        // ELASTICSEARCH_CA_CERT is not set in test environment
        OkHttpClient client = TlsClientFactory.buildOkHttpClient();
        assertNotNull(client);
        // SSLSocketFactory must be non-null (inherited from JVM default)
        assertNotNull(client.sslSocketFactory());
    }

    @Test
    void buildOkHttpClient_loadsCustomCaCert() throws Exception {
        // Generate a self-signed CA cert for testing
        Path certFile = Files.createTempFile("test-ca", ".crt");
        writeSelfSignedCaCert(certFile); // helper that writes a PEM cert

        try {
            // Inject the temp cert path via environment (use system property in test)
            System.setProperty("ELASTICSEARCH_CA_CERT_OVERRIDE", certFile.toString());
            // (adapt TlsClientFactory to also check a system property in tests)
            OkHttpClient client = TlsClientFactory.buildOkHttpClient();
            assertNotNull(client);
        } finally {
            Files.deleteIfExists(certFile);
        }
    }

    @Test
    void buildSslContext_returnsDefaultContextWhenEnvVarNotSet() {
        SSLContext ctx = TlsClientFactory.buildSslContext();
        assertNotNull(ctx);
        assertEquals("TLS", ctx.getProtocol());
    }
}
```

---

## Acceptance Criteria

- [ ] `grep -rn "InsecureSkipVerify\s*:\s*true"` returns zero results in `agent-manager/` and `plugins/`.
- [ ] `grep -rn "(chain, authType) -> true\|TrustAllStrategy\|trustAllCerts"` returns zero results in `backend/src/`.
- [ ] `grep -rn "(hostname, session) -> true"` returns zero results in `backend/src/`.
- [ ] `TlsClientFactory.buildOkHttpClient()` loads `ca.crt` when `ELASTICSEARCH_CA_CERT` is set and validates server certificates against it.
- [ ] `TlsClientFactory.buildOkHttpClient()` falls back gracefully (logs a warning, uses JVM defaults) when `ELASTICSEARCH_CA_CERT` is not set — this prevents test and local-dev breakage.
- [ ] `IsConnectionKeyValid()` in `agent-manager/utils/auth.go` no longer uses `InsecureSkipVerify`; it loads `/cert/ca.crt` and builds a proper TLS config.
- [ ] The backend container definition in `installer/docker/compose.go` mounts the cert volume at `/cert` and sets `ELASTICSEARCH_CA_CERT=/cert/ca.crt`.
- [ ] `local-dev/docker-compose.yml` backend service includes the cert volume mount and env var.
- [ ] `./mvnw test` is green.
- [ ] `go test -race ./...` passes in `agent-manager/`.
- [ ] After the change, the backend successfully connects to OpenSearch in a deployed environment (integration smoke test: `curl /api/healthcheck` returns HTTP 200 with `"status":"UP"`).
