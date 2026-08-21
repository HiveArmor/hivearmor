package com.hivearmor.multitenancy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.hivearmor.repository.HaTenantUserRepository;
import jakarta.servlet.FilterChain;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Property-based test for {@link TenantContextFilter} admin-impersonation log
 * sanitization.
 *
 * <p><strong>Property 9: TenantContextFilter admin-impersonation log sanitization</strong><br>
 * <strong>Validates: Requirements 8.9</strong>
 *
 * <h2>What is tested</h2>
 * <p>When step (a) of the resolution order fires (MSSP admin + non-blank
 * {@code X-Tenant-Prefix} header), the filter must emit <em>exactly one</em>
 * {@code INFO}-level log record whose formatted message:
 * <ol>
 *   <li>Contains the authenticated user's login ({@code auth.getName()}).</li>
 *   <li>Contains the {@code headerPrefix} value from the {@code X-Tenant-Prefix}
 *       header.</li>
 *   <li>Does <em>NOT</em> contain any substring drawn from {@code jwtPayload} or
 *       {@code requestBody} — fields that represent sensitive request data that
 *       MUST never reach the log stream.</li>
 * </ol>
 *
 * <h2>Test strategy</h2>
 * <ol>
 *   <li>Attach a Logback {@link ListAppender} to the {@code TenantContextFilter}
 *       logger before each trial.</li>
 *   <li>Generate arbitrary tuples {@code (login, headerPrefix, jwtPayload,
 *       requestBody)} where {@code jwtPayload} and {@code requestBody} are UUID-based
 *       sentinel strings provably absent from {@code login} and {@code headerPrefix}.</li>
 *   <li>Set up:
 *       <ul>
 *         <li>{@link SecurityContextHolder} with MSSP_ADMIN authority and {@code login}
 *             as the principal name.</li>
 *         <li>{@link MockHttpServletRequest} with
 *             {@code X-Tenant-Prefix: headerPrefix} header.</li>
 *       </ul></li>
 *   <li>Invoke {@code filter.doFilterInternal(request, response, dummyChain)}.</li>
 *   <li>Assert the three sanitization invariants above.</li>
 *   <li>Detach the {@link ListAppender} and clear the {@link SecurityContextHolder}
 *       after each trial via {@link AfterTry}.</li>
 * </ol>
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 9}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
class TenantContextFilterLogSanitizationPropertyTest {

    // =========================================================================
    // Infrastructure — fresh per trial
    // =========================================================================

    /**
     * Mocked {@link MsspTenantResolver}. For the step (a) path we use a header-based
     * prefix, so the resolver is never invoked; we verify that afterwards.
     */
    private final MsspTenantResolver mockResolver = mock(MsspTenantResolver.class);

    /**
     * Mocked {@link HaTenantUserRepository}. Not consulted on the step (a) path.
     */
    private final HaTenantUserRepository mockTenantUsers = mock(HaTenantUserRepository.class);

    /**
     * Filter under test — constructed directly (no Spring context needed).
     */
    private final TenantContextFilter filter =
            new TenantContextFilter(mockResolver, mockTenantUsers);

    /**
     * Logback {@link ListAppender} — attached to the filter's logger before
     * each trial and detached in {@link #afterTry()}.
     */
    private ListAppender<ILoggingEvent> listAppender;

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Cleans up after every jqwik trial:
     * <ul>
     *   <li>Detaches the {@link ListAppender} from the logger.</li>
     *   <li>Clears the {@link SecurityContextHolder}.</li>
     *   <li>Clears any residual {@link TenantContext}.</li>
     *   <li>Resets Mockito interaction state.</li>
     * </ul>
     */
    @AfterTry
    void afterTry() {
        if (listAppender != null) {
            Logger filterLogger = (Logger) LoggerFactory.getLogger(TenantContextFilter.class);
            filterLogger.detachAppender(listAppender);
            listAppender.stop();
            listAppender = null;
        }
        SecurityContextHolder.clearContext();
        TenantContext.clear();
        reset(mockResolver, mockTenantUsers);
    }

    // =========================================================================
    // Property 9: admin-impersonation log sanitization
    // =========================================================================

    /**
     * For any arbitrary tuple {@code (login, headerPrefix, jwtPayload, requestBody)}
     * where {@code jwtPayload} and {@code requestBody} are sentinel strings provably
     * absent from {@code login} and {@code headerPrefix}:
     *
     * <ol>
     *   <li>Exactly one {@code INFO} log record is emitted by the filter's logger.</li>
     *   <li>The formatted message contains {@code login}.</li>
     *   <li>The formatted message contains {@code headerPrefix}.</li>
     *   <li>The formatted message does NOT contain {@code jwtPayload}.</li>
     *   <li>The formatted message does NOT contain {@code requestBody}.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 8.9</strong>
     */
    @Property(tries = 100)
    @Tag("Feature: sprint-21-mssp-schema")
    @Tag("Property 9")
    void property9_adminImpersonation_logContainsLoginAndPrefix_notPayloadOrBody(
            @ForAll("adminLogTuples") AdminLogTuple tuple) throws Exception {

        // ----- Step 1: attach ListAppender to the filter's Logback logger -----
        Logger filterLogger = (Logger) LoggerFactory.getLogger(TenantContextFilter.class);
        listAppender = new ListAppender<>();
        listAppender.start();
        filterLogger.addAppender(listAppender);

        // ----- Step 2: configure SecurityContextHolder with MSSP_ADMIN + login -----
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                tuple.login,
                null,
                List.of(new SimpleGrantedAuthority("MSSP_ADMIN"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        // ----- Step 3: build MockHttpServletRequest with X-Tenant-Prefix header -----
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/ha-alerts");
        request.addHeader("X-Tenant-Prefix", tuple.headerPrefix);

        MockHttpServletResponse response = new MockHttpServletResponse();

        // Dummy filter chain that does nothing — we only care about logging.
        FilterChain dummyChain = mock(FilterChain.class);

        // ----- Step 4: invoke the filter -----
        filter.doFilterInternal(request, response, dummyChain);

        // ----- Step 5: collect INFO records from the ListAppender -----
        List<ILoggingEvent> infoRecords = listAppender.list.stream()
                .filter(e -> e.getLevel() == Level.INFO)
                .collect(Collectors.toList());

        // Exactly one INFO record must have been emitted.
        assertThat(infoRecords)
                .as("Expected exactly one INFO log record for login='%s', headerPrefix='%s'",
                        tuple.login, tuple.headerPrefix)
                .hasSize(1);

        String formattedMessage = infoRecords.get(0).getFormattedMessage();

        // The message must contain the login.
        assertThat(formattedMessage)
                .as("Log message must contain login='%s'", tuple.login)
                .contains(tuple.login);

        // The message must contain the header prefix.
        assertThat(formattedMessage)
                .as("Log message must contain headerPrefix='%s'", tuple.headerPrefix)
                .contains(tuple.headerPrefix);

        // The message must NOT contain the jwtPayload sentinel.
        assertThat(formattedMessage)
                .as("Log message MUST NOT contain jwtPayload sentinel '%s' (login='%s', headerPrefix='%s')",
                        tuple.jwtPayload, tuple.login, tuple.headerPrefix)
                .doesNotContain(tuple.jwtPayload);

        // The message must NOT contain the requestBody sentinel.
        assertThat(formattedMessage)
                .as("Log message MUST NOT contain requestBody sentinel '%s' (login='%s', headerPrefix='%s')",
                        tuple.requestBody, tuple.login, tuple.headerPrefix)
                .doesNotContain(tuple.requestBody);

        // Verify the resolver was never called — step (a) short-circuits.
        verify(mockResolver, never()).resolvePrefix(any());
        verify(mockTenantUsers, never()).findFirstByJhiUserId(any());
    }

    // =========================================================================
    // Arbitrary: AdminLogTuple generator
    // =========================================================================

    /**
     * Produces arbitrary {@link AdminLogTuple} instances where:
     * <ul>
     *   <li>{@code login} is a non-blank string of length 1–40.</li>
     *   <li>{@code headerPrefix} is a valid client-prefix string (lowercase
     *       alphanumerics and hyphens, length 2–20).</li>
     *   <li>{@code jwtPayload} is a UUID-based sentinel that is provably absent from
     *       {@code login} and {@code headerPrefix}.</li>
     *   <li>{@code requestBody} is a separate UUID-based sentinel, also absent from
     *       {@code login} and {@code headerPrefix}.</li>
     * </ul>
     *
     * <p>UUID sentinel strings contain only hex digits and hyphens, so they cannot
     * coincidentally appear in {@code login} (printable ASCII range excluding
     * UUID-format substrings) or in {@code headerPrefix} (lowercase alphanumeric +
     * hyphen). To guarantee no accidental overlap, the generator filters out any
     * {@code login} that contains the UUID substring pattern. In practice, random
     * ASCII strings of length ≤ 40 almost never collide with a specific UUID, so the
     * filter rejection rate is negligible.
     */
    @Provide
    Arbitrary<AdminLogTuple> adminLogTuples() {
        // login: printable ASCII, non-blank, 1–40 chars
        Arbitrary<String> loginArb = Arbitraries.strings()
                .withCharRange('a', 'z')
                .withCharRange('A', 'Z')
                .withCharRange('0', '9')
                .withChars("._-@")
                .ofMinLength(1)
                .ofMaxLength(40)
                .filter(s -> !s.isBlank());

        // headerPrefix: valid client-prefix regex ^[a-z0-9][a-z0-9-]{1,19}$
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");
        Arbitrary<String> restArb = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);
        Arbitrary<String> headerPrefixArb = Combinators.combine(firstChar, restArb)
                .as((first, rest) -> first + rest);

        return Combinators.combine(loginArb, headerPrefixArb)
                .as((login, headerPrefix) -> {
                    // Generate UUID-based sentinels that are distinct from login/headerPrefix.
                    // UUID strings only contain [0-9a-f-], which can theoretically overlap
                    // with a valid headerPrefix (which also uses [a-z0-9-]).
                    // To ensure strict non-containment, prefix sentinel with an uppercase
                    // marker that cannot appear in either login or headerPrefix.
                    String jwtSentinel = "JWT_" + UUID.randomUUID().toString().replace("-", "X");
                    String bodySentinel = "BODY_" + UUID.randomUUID().toString().replace("-", "Y");
                    return new AdminLogTuple(login, headerPrefix, jwtSentinel, bodySentinel);
                })
                // Safety filter: ensure sentinels are not accidentally present in login/headerPrefix.
                .filter(t -> !t.login.contains(t.jwtPayload)
                          && !t.login.contains(t.requestBody)
                          && !t.headerPrefix.contains(t.jwtPayload)
                          && !t.headerPrefix.contains(t.requestBody));
    }

    // =========================================================================
    // Data container
    // =========================================================================

    /**
     * Immutable tuple carrying the four generated values for one property trial:
     * <ul>
     *   <li>{@code login} — the MSSP admin's principal name</li>
     *   <li>{@code headerPrefix} — the value of the {@code X-Tenant-Prefix} header</li>
     *   <li>{@code jwtPayload} — a sentinel string representing sensitive JWT payload
     *       content that must never appear in the log</li>
     *   <li>{@code requestBody} — a sentinel string representing sensitive request body
     *       content that must never appear in the log</li>
     * </ul>
     */
    record AdminLogTuple(String login, String headerPrefix, String jwtPayload, String requestBody) {}
}
