package org.apache.http.client.utils;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import java.util.List;

/**
 * Shadow class that patches the missing formatSegments method used by
 * opensearch-java PathEncoder via MethodHandle lookup.
 *
 * PathEncoder.static{} does:
 *   Class.forName("org.apache.http.client.utils.URLEncodedUtils")   // finds HC4 class
 *   MethodHandles.lookup().findStatic(that_class, "formatSegments", (String, Iterable, Charset)->String)
 *
 * HC4's real URLEncodedUtils doesn't have formatSegments (that's an HC5 method).
 * This shadow class adds it so PathEncoder can initialize without error.
 *
 * This class shadows the HC4 class because Spring Boot's LaunchedURLClassLoader loads
 * WEB-INF/classes/ before WEB-INF/lib/, so our class wins.
 */
public class URLEncodedUtils {

    private URLEncodedUtils() {}

    /**
     * Formats path segments for URL encoding.
     * Delegates to HC5 URLEncodedUtils if available, otherwise uses plain URLEncoder.
     */
    public static String formatSegments(Iterable<String> segments, Charset charset) {
        try {
            // Delegate to HC5 if present
            Class<?> hc5 = Class.forName("org.apache.hc.core5.net.URLEncodedUtils");
            java.lang.reflect.Method m = hc5.getMethod("formatSegments", Iterable.class, Charset.class);
            return (String) m.invoke(null, segments, charset);
        } catch (Exception e) {
            // Fallback: manual encoding
            StringBuilder sb = new StringBuilder();
            for (String seg : segments) {
                sb.append('/');
                sb.append(URLEncoder.encode(seg, charset).replace("+", "%20"));
            }
            return sb.length() == 0 ? "/" : sb.toString();
        }
    }

    /**
     * Varargs overload used by some callers.
     */
    public static String formatSegments(String... segments) {
        return formatSegments(java.util.Arrays.asList(segments), StandardCharsets.UTF_8);
    }
}
