package com.hivearmor.service.connector;

import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * AWS EC2 Network ACL deny helper for {@code BLOCK_IP}.
 *
 * <p>Live path: {@code CreateNetworkAclEntry} (RuleAction=deny, Protocol=-1) for a {@code /32}
 * (or {@code /128}) CIDR. HTTPS-only via {@link ConnectorUrlGuard}. Never logs access keys.
 *
 * <p>STAGING CANDIDATE — unit-tested with mocked HTTP; not live-account verified.
 */
@Component
public class AwsNetworkBlockClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(12);
    private static final String SERVICE = "ec2";
    private static final String API_VERSION = "2016-11-15";
    private static final DateTimeFormatter AMZ_DATE =
        DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter AMZ_DATE_SHORT =
        DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC);

    @FunctionalInterface
    public interface UrlGuard {
        URI requireHttps(String url);
    }

    private final HttpClient httpClient;
    private final UrlGuard urlGuard;

    public AwsNetworkBlockClient() {
        this(
            HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build(),
            ConnectorUrlGuard::requireHttpsUrl
        );
    }

    public AwsNetworkBlockClient(HttpClient httpClient) {
        this(httpClient, ConnectorUrlGuard::requireHttpsUrl);
    }

    /** Package/test constructor — inject HttpClient and optional URL guard (no DNS in unit tests). */
    public AwsNetworkBlockClient(HttpClient httpClient, UrlGuard urlGuard) {
        this.httpClient = httpClient != null
            ? httpClient
            : HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        this.urlGuard = urlGuard != null ? urlGuard : ConnectorUrlGuard::requireHttpsUrl;
    }

    /**
     * Create an inbound (or egress) Network ACL deny entry for {@code cidrBlock}.
     *
     * @return result map with {@code ok}, {@code httpStatus}, {@code cidr}, {@code networkAclId}, {@code message}
     */
    public Map<String, Object> createNetworkAclDenyEntry(
            String region,
            String accessKeyId,
            String secretAccessKey,
            String sessionToken,
            String networkAclId,
            String cidrBlock,
            int ruleNumber,
            boolean egress) {
        String reg = requireRegion(region);
        String keyId = requireNonBlank(accessKeyId, "access_key_id");
        String secret = requireNonBlank(secretAccessKey, "secret_access_key");
        if (looksLikePlaceholderValue(keyId) || looksLikePlaceholderValue(secret)
            || looksLikePlaceholderValue(sessionToken)) {
            throw new IllegalArgumentException("Refusing AWS mutate with placeholder credentials");
        }
        String aclId = requireNonBlank(networkAclId, "network_acl_id");
        String cidr = requireNonBlank(cidrBlock, "cidr");
        if (ruleNumber < 1 || ruleNumber > 32766) {
            throw new IllegalArgumentException("rule_number must be between 1 and 32766");
        }

        String host = "ec2." + reg + ".amazonaws.com";
        String endpoint = "https://" + host + "/";
        URI uri = urlGuard.requireHttps(endpoint);

        TreeMap<String, String> params = new TreeMap<>();
        params.put("Action", "CreateNetworkAclEntry");
        params.put("Version", API_VERSION);
        params.put("NetworkAclId", aclId);
        params.put("RuleNumber", Integer.toString(ruleNumber));
        params.put("Protocol", "-1");
        params.put("RuleAction", "deny");
        params.put("Egress", Boolean.toString(egress));
        params.put("CidrBlock", cidr);

        String body = params.entrySet().stream()
            .map(e -> urlEncode(e.getKey()) + "=" + urlEncode(e.getValue()))
            .collect(Collectors.joining("&"));

        Instant now = Instant.now();
        String amzDate = AMZ_DATE.format(now);
        String dateStamp = AMZ_DATE_SHORT.format(now);

        try {
            String authorization = signEc2Post(
                reg, host, body, amzDate, dateStamp, keyId, secret, sessionToken);

            HttpRequest.Builder req = HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                .header("X-Amz-Date", amzDate)
                .header("Authorization", authorization)
                .header("User-Agent", "HiveArmor-Connector/1.0")
                .POST(HttpRequest.BodyPublishers.ofString(body));
            if (sessionToken != null && !sessionToken.isBlank()) {
                req.header("X-Amz-Security-Token", sessionToken.trim());
            }

            HttpResponse<String> resp = httpClient.send(req.build(), HttpResponse.BodyHandlers.ofString());
            int code = resp.statusCode();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("cidr", cidr);
            out.put("networkAclId", aclId);
            out.put("ruleNumber", ruleNumber);
            out.put("egress", egress);
            out.put("region", reg);
            out.put("httpStatus", code);
            out.put("mechanism", "ec2.CreateNetworkAclEntry");
            if (code >= 200 && code < 300) {
                out.put("ok", true);
                out.put("message", "AWS NACL deny entry created (HTTP " + code + ")");
                return out;
            }
            out.put("ok", false);
            out.put("message", statusMessage(code));
            return out;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("AWS NACL deny failed: " + safeError(e), e);
        }
    }

    public static boolean looksLikePlaceholder(Map<String, String> config) {
        if (config == null || config.isEmpty()) {
            return true;
        }
        for (String v : config.values()) {
            if (looksLikePlaceholderValue(v)) {
                return true;
            }
        }
        return false;
    }

    public static boolean looksLikePlaceholderValue(String v) {
        return v != null && v.toLowerCase(Locale.ROOT).contains("placeholder");
    }

    private String signEc2Post(
            String region,
            String host,
            String body,
            String amzDate,
            String dateStamp,
            String accessKeyId,
            String secretAccessKey,
            String sessionToken) throws Exception {
        String payloadHash = sha256Hex(body);
        String canonicalHeaders = "content-type:application/x-www-form-urlencoded; charset=utf-8\n"
            + "host:" + host + "\n"
            + "x-amz-date:" + amzDate + "\n";
        String signedHeaders = "content-type;host;x-amz-date";
        if (sessionToken != null && !sessionToken.isBlank()) {
            canonicalHeaders += "x-amz-security-token:" + sessionToken.trim() + "\n";
            signedHeaders = "content-type;host;x-amz-date;x-amz-security-token";
        }

        String canonicalRequest = "POST\n/\n\n"
            + canonicalHeaders + "\n"
            + signedHeaders + "\n"
            + payloadHash;

        String credentialScope = dateStamp + "/" + region + "/" + SERVICE + "/aws4_request";
        String stringToSign = "AWS4-HMAC-SHA256\n"
            + amzDate + "\n"
            + credentialScope + "\n"
            + sha256Hex(canonicalRequest);

        byte[] signingKey = getSignatureKey(secretAccessKey, dateStamp, region, SERVICE);
        String signature = HexFormat.of().formatHex(hmacSha256(signingKey, stringToSign));

        return "AWS4-HMAC-SHA256 Credential=" + accessKeyId + "/" + credentialScope
            + ", SignedHeaders=" + signedHeaders
            + ", Signature=" + signature;
    }

    private static byte[] getSignatureKey(String key, String dateStamp, String regionName, String serviceName)
        throws Exception {
        byte[] kDate = hmacSha256(("AWS4" + key).getBytes(StandardCharsets.UTF_8), dateStamp);
        byte[] kRegion = hmacSha256(kDate, regionName);
        byte[] kService = hmacSha256(kRegion, serviceName);
        return hmacSha256(kService, "aws4_request");
    }

    private static byte[] hmacSha256(byte[] key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256Hex(String data) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(data.getBytes(StandardCharsets.UTF_8)));
    }

    private static String requireRegion(String region) {
        String reg = requireNonBlank(region, "region");
        if (!reg.matches("[a-z0-9-]+")) {
            throw new IllegalArgumentException("Invalid AWS region format");
        }
        return reg;
    }

    private static String requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required config: " + field);
        }
        return value.trim();
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String statusMessage(int code) {
        if (code == 401 || code == 403) {
            return "AWS authentication/authorization failed (HTTP " + code + ")";
        }
        if (code == 400) {
            return "AWS rejected CreateNetworkAclEntry (HTTP 400) — check ACL id, rule number, CIDR";
        }
        return "AWS EC2 unexpected HTTP " + code;
    }

    /** Avoid echoing secrets that might appear in rare exception text. */
    static String safeError(Exception e) {
        String msg = e.getMessage();
        if (msg == null) {
            return e.getClass().getSimpleName();
        }
        return msg
            .replaceAll("(?i)AKIA[0-9A-Z]{16}", "AKIA***")
            .replaceAll("(?i)Credential=[^,\\s]+", "Credential=***")
            .replaceAll("(?i)Signature=[0-9a-f]+", "Signature=***")
            .replaceAll("(?i)secret[_-]?access[_-]?key[=:]\\s*\\S+", "secret_access_key=***")
            .replaceAll("(?i)X-Amz-Security-Token[=:]\\s*\\S+", "X-Amz-Security-Token=***");
    }
}
