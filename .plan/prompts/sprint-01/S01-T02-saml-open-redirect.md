# S01-T02 — Fix SAML Open Redirect via X-Forwarded-Host

**Sprint:** 1 (Security-Critical)  
**Severity:** CRITICAL  
**Issue ID:** SEC-NEW-04  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

After a successful SAML login, `Saml2LoginSuccessHandler` builds the frontend redirect URL using the `X-Forwarded-Host` request header. An attacker who can set this header (any proxy, MITM, or direct HTTP attack) can redirect the victim's browser to `attacker.example.com/?token=<full_JWT>`, stealing the session token.

**Vulnerable file:**
`backend/src/main/java/com/nilachakra/security/saml/Saml2LoginSuccessHandler.java`

**Vulnerable code (around line 44):**
```java
String scheme = Objects.requireNonNullElse(request.getHeader("X-Forwarded-Proto"), request.getScheme());
String host = Objects.requireNonNullElse(request.getHeader("X-Forwarded-Host"), request.getServerName());
String frontBaseUrl = scheme + "://" + host;
// ... builds redirect URL from frontBaseUrl including ?token=JWT
response.sendRedirect(redirectUri.toString());
```

---

## What to Read First

1. `backend/src/main/java/com/nilachakra/security/saml/Saml2LoginSuccessHandler.java` — read the entire file
2. `backend/src/main/resources/config/application.yml` — to understand existing app config structure
3. `backend/src/main/resources/config/application-prod.yml` — to find where to add the new config property
4. `backend/src/main/resources/config/application-dev.yml` — for dev config

---

## Implementation Steps

### Step 1: Add frontend URL config property

In `backend/src/main/resources/config/application.yml` (or `application-prod.yml` if environment-specific), add:

```yaml
app:
  frontend-url: http://localhost:4200  # overridden per-environment
```

In `application-prod.yml`, set:
```yaml
app:
  frontend-url: ${APP_FRONTEND_URL:https://armorsight.yourdomain.com}
```

In `application-dev.yml`, set:
```yaml
app:
  frontend-url: http://localhost:4200
```

### Step 2: Create AppProperties configuration class

Create: `backend/src/main/java/com/nilachakra/config/AppProperties.java`

```java
package com.nilachakra.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {
    private String frontendUrl = "http://localhost:4200";

    public String getFrontendUrl() { return frontendUrl; }
    public void setFrontendUrl(String frontendUrl) { this.frontendUrl = frontendUrl; }
}
```

### Step 3: Fix `Saml2LoginSuccessHandler.java`

Replace the `X-Forwarded-*` header reading with the injected config value:

```java
@RequiredArgsConstructor
public class Saml2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final TokenProvider tokenProvider;
    private final UserRepository userRepository;
    private final AppProperties appProperties;  // ADD THIS

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        
        // BEFORE (VULNERABLE):
        // String scheme = Objects.requireNonNullElse(request.getHeader("X-Forwarded-Proto"), request.getScheme());
        // String host = Objects.requireNonNullElse(request.getHeader("X-Forwarded-Host"), request.getServerName());
        // String frontBaseUrl = scheme + "://" + host;

        // AFTER (SAFE):
        String frontBaseUrl = appProperties.getFrontendUrl();
        
        // rest of the method unchanged — build redirectUri from frontBaseUrl
        // ...
    }
}
```

### Step 4: Update `SecurityConfiguration.java` to pass `AppProperties`

In `SecurityConfiguration.java`, `AppProperties` needs to be injected and passed to the handler:

```java
@RequiredArgsConstructor
public class SecurityConfiguration {
    // existing fields...
    private final AppProperties appProperties;  // ADD

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // ...
            .saml2Login(saml2 -> saml2
                .successHandler(new Saml2LoginSuccessHandler(tokenProvider, userRepository, appProperties))  // pass appProperties
                .failureHandler(new Saml2LoginFailureHandler())
            )
        // ...
    }
}
```

### Step 5: Unit test

Create: `backend/src/test/java/com/nilachakra/security/saml/Saml2LoginSuccessHandlerTest.java`

```java
@ExtendWith(MockitoExtension.class)
class Saml2LoginSuccessHandlerTest {

    @Mock TokenProvider tokenProvider;
    @Mock UserRepository userRepository;
    @Mock AppProperties appProperties;
    @Mock HttpServletRequest request;
    @Mock HttpServletResponse response;
    @Mock Authentication authentication;

    @Test
    void onSuccess_usesConfiguredFrontendUrl_notXForwardedHost() throws Exception {
        // Arrange
        when(appProperties.getFrontendUrl()).thenReturn("https://legitimate.armorsight.com");
        when(request.getHeader("X-Forwarded-Host")).thenReturn("attacker.example.com");
        // ... mock authentication to return a valid SAML principal
        
        var handler = new Saml2LoginSuccessHandler(tokenProvider, userRepository, appProperties);
        
        // Capture the redirect URL
        ArgumentCaptor<String> redirectCaptor = ArgumentCaptor.forClass(String.class);
        
        // Act
        handler.onAuthenticationSuccess(request, response, authentication);
        
        // Assert: redirect must use the configured URL, never the attacker header
        verify(response).sendRedirect(redirectCaptor.capture());
        assertThat(redirectCaptor.getValue()).startsWith("https://legitimate.armorsight.com");
        assertThat(redirectCaptor.getValue()).doesNotContain("attacker.example.com");
    }

    @Test
    void onSuccess_redirectContainsToken() throws Exception {
        when(appProperties.getFrontendUrl()).thenReturn("https://legitimate.armorsight.com");
        // mock valid authentication principal...
        when(tokenProvider.createToken(any(), anyBoolean())).thenReturn("mock.jwt.token");
        
        ArgumentCaptor<String> redirectCaptor = ArgumentCaptor.forClass(String.class);
        handler.onAuthenticationSuccess(request, response, authentication);
        
        verify(response).sendRedirect(redirectCaptor.capture());
        assertThat(redirectCaptor.getValue()).contains("token=");
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

# Compile to verify no injection errors
./mvnw compile -q

# Run the unit test
./mvnw test -Dtest=Saml2LoginSuccessHandlerTest -DfailIfNoTests=false

# Run all security tests
./mvnw test -Dtest="*Saml*,*Security*" -DfailIfNoTests=false

# Manual verification (requires SAML IdP configured in dev):
# With X-Forwarded-Host set to attacker domain, the redirect must still go to the configured frontend URL
```

---

## Environment Variable

After this fix, add `APP_FRONTEND_URL` to your deployment's environment:

```bash
# docker-compose.yml — backend service environment:
- APP_FRONTEND_URL=https://yourdomain.com
```

---

## Acceptance Criteria

- [ ] `Saml2LoginSuccessHandler` no longer reads `X-Forwarded-Host` or `X-Forwarded-Proto`
- [ ] Redirect URL is sourced from `app.frontend-url` config property
- [ ] `APP_FRONTEND_URL` environment variable overrides the default
- [ ] Unit test passes confirming attacker-controlled header is ignored
- [ ] `./mvnw compile` succeeds
- [ ] SAML login flow in dev still redirects to `http://localhost:4200` (or configured value)
