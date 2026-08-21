---
name: spring-security-jwt
description: Spring Security 6 JWT filter chain, RBAC with method security, SecurityFilterChain bean pattern. Covers SEC-02 fix (ephemeral JWT key) and proper auth configuration for HiveArmor.
metadata:
  type: skill
  source: rrezartprebreza/spring-boot-skills (adapted for HiveArmor)
---

# Spring Security 6 — JWT & Auth Patterns

## Project Context
- Spring Security 6 `SecurityFilterChain` bean pattern (not WebSecurityConfigurerAdapter)
- JWT key is currently **ephemeral** (regenerated on restart) — this is DEBT-14 / SEC-02
- JWT localStorage key: `hivearmor_auth_token`
- Public path list is explicit in `SecurityConfiguration.java`

## SecurityFilterChain Pattern (existing codebase pattern — follow this)
```java
@Configuration
@EnableMethodSecurity  // enables @PreAuthorize
public class SecurityConfiguration {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, 
                                           JWTFilter jwtFilter) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .authorizeHttpRequests(auth -> auth
                // Public paths — must be explicitly listed
                .requestMatchers("/api/authenticate").permitAll()
                .requestMatchers("/api/register").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                // Everything else requires auth
                .anyRequest().authenticated()
            )
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .build();
    }
}
```
**Rule:** Every new public endpoint must be added to the explicit `permitAll()` list. Never use `.anyRequest().permitAll()`.

## JWT Filter — Standard Pattern
```java
@Component
public class JWTFilter extends OncePerRequestFilter {
    
    public static final String AUTHORIZATION_HEADER = "Authorization";
    private final TokenProvider tokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request, 
                                    HttpServletResponse response, 
                                    FilterChain chain) throws IOException, ServletException {
        
        String jwt = resolveToken(request);
        if (StringUtils.hasText(jwt) && tokenProvider.validateToken(jwt)) {
            Authentication auth = tokenProvider.getAuthentication(jwt);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        chain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader(AUTHORIZATION_HEADER);
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
```

## SEC-02 Fix — Persistent JWT Signing Key
```java
// CURRENT (BAD) — key regenerated on every restart, invalidates all sessions
private Key key = Keys.secretKeyFor(SignatureAlgorithm.HS512);

// FIXED — load from env var, persist across restarts
@PostConstruct
public void init() {
    byte[] keyBytes = Base64.getDecoder().decode(
        Objects.requireNonNull(env.getProperty("jhipster.security.authentication.jwt.base64-secret"),
            "JWT base64-secret must be set")
    );
    this.key = Keys.hmacShaKeyFor(keyBytes);
}
```
In `application-prod.yml`:
```yaml
jhipster:
  security:
    authentication:
      jwt:
        base64-secret: ${JWT_SECRET}  # inject via env var
        token-validity-in-seconds: 86400
```

## Method-Level Security (use consistently)
```java
// Role-based
@PreAuthorize("hasRole('ADMIN')")
public void deleteUser(String login) { ... }

// Expression-based
@PreAuthorize("hasRole('USER') and #login == authentication.name")
public UserDTO getUser(String login) { ... }

// Complex SOC roles
@PreAuthorize("hasAnyRole('SOC_ANALYST', 'SOC_MANAGER', 'ADMIN')")
public List<AlertDTO> getAlerts() { ... }
```

## Internal API Key Filter (existing pattern — InternalApiKeyFilter.java)
```java
// Protects /api/ha-internal/* endpoints called by event-processor
// Checks X-Internal-Key header against INTERNAL_KEY env var
// Follow this exact pattern for any new internal-only endpoints
```

## SEC-01 Fix — Never Password in GET Params
```java
// BAD (existing bug — do not replicate)
@GetMapping("/check-credentials")
public ResponseEntity<?> check(@RequestParam String password) { ... }

// GOOD
@PostMapping("/check-credentials") 
public ResponseEntity<?> check(@RequestBody CredentialCheckRequest request) { ... }
```
