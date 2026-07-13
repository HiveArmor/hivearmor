package com.hivearmor.config;

import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.api_key.ApiKeyConfigurer;
import com.hivearmor.security.api_key.ApiKeyFilter;
import com.hivearmor.security.internalApiKey.InternalApiKeyConfigurer;
import com.hivearmor.security.internalApiKey.InternalApiKeyProvider;
import com.hivearmor.security.jwt.JWTConfigurer;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.security.saml.Saml2LoginFailureHandler;
import com.hivearmor.security.saml.Saml2LoginSuccessHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.CorsFilter;
import org.zalando.problem.spring.web.advice.security.SecurityProblemSupport;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Spring Security configuration.
 *
 * Phase 6a migration: replaced deprecated WebSecurityConfigurerAdapter (removed in Spring
 * Security 6.0) with the SecurityFilterChain bean approach. All HTTP authorisation rules
 * are unchanged — only the wiring API has changed.
 *
 * Deprecated APIs replaced:
 *   - extends WebSecurityConfigurerAdapter          → @Bean SecurityFilterChain
 *   - @EnableGlobalMethodSecurity(prePostEnabled)   → @EnableMethodSecurity
 *   - .authorizeRequests()                          → .authorizeHttpRequests()
 *   - .antMatchers(...)                             → .requestMatchers(...)
 *   - @PostConstruct init() + AuthenticationManagerBuilder → DaoAuthenticationProvider bean
 *   - authenticationManagerBean() override          → AuthenticationConfiguration injection
 *
 * Security contracts that must NOT change (verified via T-005a interceptor tests):
 *   - COOKIE_AUTH_TOKEN = 'utmauth'
 *   - ACCESS_KEY = 'Utm-Internal-Key'
 *   - SESSION_AUTH_TOKEN key pattern
 */
@Configuration
@RequiredArgsConstructor
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true, securedEnabled = true)
@Import(SecurityProblemSupport.class)
public class SecurityConfiguration {

    private final UserDetailsService userDetailsService;
    private final TokenProvider tokenProvider;
    private final CorsFilter corsFilter;
    private final InternalApiKeyProvider internalApiKeyProvider;
    private final ApiKeyFilter apiKeyFilter;
    private final UserRepository userRepository;
    private final AppProperties appProperties;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authConfig) throws Exception {
        return authConfig.getAuthenticationManager();
    }

    @Bean
    public WebSecurityCustomizer webSecurityCustomizer() {
        return web -> web.ignoring()
                .requestMatchers(HttpMethod.OPTIONS, "/**")
                .requestMatchers("/swagger-ui/**")
                .requestMatchers("/i18n/**");
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .addFilterBefore(corsFilter, UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(
                                (request, response, authException) ->
                                        response.sendError(HttpServletResponse.SC_UNAUTHORIZED))
                        .accessDeniedHandler(
                                (request, response, accessDeniedException) ->
                                        response.sendError(HttpServletResponse.SC_FORBIDDEN))
                )
                .headers(headers -> headers.frameOptions(fo -> fo.disable()))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/authenticate").permitAll()
                        .requestMatchers("/api/authenticateFederationServiceManager").permitAll()
                        .requestMatchers("/api/ping").permitAll()
                        .requestMatchers("/api/date-format").permitAll()
                        .requestMatchers("/api/healthcheck").permitAll()
                        .requestMatchers("/api/releaseInfo").permitAll()
                        .requestMatchers("/api/account/reset-password/init").permitAll()
                        .requestMatchers("/api/account/reset-password/finish").permitAll()
                        .requestMatchers("/api/ha-providers").permitAll()
                        .requestMatchers("/api/images/all").permitAll()
                        .requestMatchers("/api/info/version").permitAll()
                        .requestMatchers("/api/enrollment/**")
                                .hasAnyAuthority(AuthoritiesConstants.PRE_VERIFICATION_USER)
                        .requestMatchers("/api/tfa/verify-code")
                                .hasAnyAuthority(AuthoritiesConstants.PRE_VERIFICATION_USER,
                                                 AuthoritiesConstants.USER,
                                                 AuthoritiesConstants.ADMIN)
                        .requestMatchers("/api/tfa/refresh")
                                .hasAnyAuthority(AuthoritiesConstants.PRE_VERIFICATION_USER,
                                                 AuthoritiesConstants.USER,
                                                 AuthoritiesConstants.ADMIN)
                        .requestMatchers("/api/tfa/**")
                                .hasAnyAuthority(AuthoritiesConstants.ADMIN, AuthoritiesConstants.USER)
                        .requestMatchers("/api/ha-incident-jobs", "/api/ha-incident-jobs")
                                .hasAuthority(AuthoritiesConstants.ADMIN)
                        .requestMatchers("/api/ha-incident-jobs/**", "/api/ha-incident-jobs/**")
                                .hasAuthority(AuthoritiesConstants.ADMIN)
                        .requestMatchers("/api/ha-incident-variables/**", "/api/ha-incident-variables/**")
                                .hasAuthority(AuthoritiesConstants.ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/ha-incident-variables", "/api/ha-incident-variables")
                                .hasAnyAuthority(AuthoritiesConstants.ADMIN, AuthoritiesConstants.USER)
                        .requestMatchers("/api/custom-reports/**").denyAll()
                        .requestMatchers("/api/**")
                                .hasAnyAuthority(AuthoritiesConstants.ADMIN, AuthoritiesConstants.USER)
                        .requestMatchers("/ws/topic").hasAuthority(AuthoritiesConstants.ADMIN)
                        .requestMatchers("/ws/**").permitAll()
                        .requestMatchers("/management/info").permitAll()
                        .requestMatchers("/management/**")
                                .hasAnyAuthority(AuthoritiesConstants.ADMIN, AuthoritiesConstants.USER)
                )
                .saml2Login(saml2 -> saml2
                        .successHandler(new Saml2LoginSuccessHandler(tokenProvider, userRepository, appProperties))
                        .failureHandler(new Saml2LoginFailureHandler())
                )
                .with(new JWTConfigurer(tokenProvider), c -> {})
                .with(new InternalApiKeyConfigurer(internalApiKeyProvider), c -> {})
                .with(new ApiKeyConfigurer(apiKeyFilter), c -> {});

        return http.build();
    }

    @Bean
    public Saml2LoginFailureHandler saml2LoginFailureHandler() {
        return new Saml2LoginFailureHandler();
    }
}
