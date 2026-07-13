package com.hivearmor.web.rest;

import com.hivearmor.aop.logging.AuditEvent;
import com.hivearmor.config.Constants;
import com.hivearmor.domain.User;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.federation_service.UtmFederationServiceClient;
import com.hivearmor.loggin.LogContextBuilder;
import com.hivearmor.repository.federation_service.UtmFederationServiceClientRepository;
import com.hivearmor.security.TooMuchLoginAttemptsException;
import com.hivearmor.security.jwt.JWTFilter;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.UserService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.CheckCredentialsRequest;
import com.hivearmor.service.dto.jwt.JWTToken;
import com.hivearmor.service.dto.jwt.LoginResponseDTO;
import com.hivearmor.service.login_attempts.LoginAttemptService;
import com.hivearmor.service.tfa.TfaService;
import com.hivearmor.util.CipherUtil;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.util.exceptions.InvalidConnectionKeyException;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.vm.LoginVM;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Base64;
import java.util.Map;

import static com.hivearmor.config.Constants.ADMIN_EMAIL;

/**
 * Controller to authenticate users.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
@RequestMapping("/api")
public class UserJWTController {

    private static final String CLASSNAME = "UserJWTController";

    private final TokenProvider tokenProvider;
    private final AuthenticationManager authenticationManager;
    private final ApplicationEventService applicationEventService;
    private final UserService userService;
    private final LoginAttemptService loginAttemptService;
    private final UtmFederationServiceClientRepository fsClientRepository;
    private final TfaService tfaService;
    private final LogContextBuilder logContextBuilder;
    private final UserDetailsService userDetailsService;
    private final PasswordEncoder passwordEncoder;

    @AuditEvent(
            attemptType = ApplicationEventType.AUTH_ATTEMPT,
            attemptMessage = "Authentication attempt registered",
            successType = ApplicationEventType.UNDEFINED,
            successMessage = ""
    )
    @PostMapping("/authenticate")
    public ResponseEntity<LoginResponseDTO> authorize(@Valid @RequestBody LoginVM loginVM, HttpServletRequest request) {

        if (loginAttemptService.isBlocked()) {
            String ip = loginAttemptService.getClientIP();
            throw new TooMuchLoginAttemptsException(String.format("Authentication blocked: IP %s exceeded login attempt threshold", ip));
        }

        boolean isAuth = this.tokenProvider.shouldBypassTfa(request);
        boolean isTfaEnabled = Boolean.parseBoolean(Constants.CFG.get(Constants.PROP_TFA_ENABLE));

        UsernamePasswordAuthenticationToken authenticationToken =
                new UsernamePasswordAuthenticationToken(loginVM.getUsername(), loginVM.getPassword());

        Authentication authentication = authenticationManager.authenticate(authenticationToken);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        String token = tokenProvider.createToken(authentication, loginVM.isRememberMe(), isAuth);

        User user = userService.getUserWithAuthoritiesByLogin(loginVM.getUsername())
                .orElseThrow(() -> new BadCredentialsException("Authentication failed: user '" + loginVM.getUsername() + "' not found"));

        boolean isTfaSetup = isTfaEnabled && user.getTfaMethod() != null && !user.getTfaMethod().isEmpty() && !isAuth;
        Map<String, Object> args = logContextBuilder.buildArgs(request);
        long tfaExpiresInSeconds = 0L;

        if (isTfaSetup) {
            tfaExpiresInSeconds = tfaService.generateChallenge(user);

            args.put("tfaMethod", user.getTfaMethod());
            applicationEventService.createEvent(
                    "TFA challenge issued for user '" + user.getLogin() + "' via method '" + user.getTfaMethod() + "'",
                    ApplicationEventType.TFA_CODE_SENT,
                    args
            );
        } else {
            applicationEventService.createEvent(
                    "Login successfully completed for user '" + user.getLogin() + "'",
                    ApplicationEventType.AUTH_SUCCESS,
                    args
            );
        }

        LoginResponseDTO response = LoginResponseDTO.builder()
                .token(token)
                .method(user.getTfaMethod())
                .success(true)
                .tfaConfigured(isTfaSetup)
                .forceTfa(!isAuth)
                .tfaExpiresInSeconds(tfaExpiresInSeconds)
                .firstLogin(user.getEmail().equals(ADMIN_EMAIL))
                .build();

        return ResponseEntity.ok(response);
    }


    @PostMapping("/check-credentials")
    public ResponseEntity<String> checkPassword(@RequestBody CheckCredentialsRequest request) {
        final String ctx = CLASSNAME + ".checkPassword";
        try {
            User user = userService.getCurrentUserLogin();

            UserDetails userDetails = userDetailsService.loadUserByUsername(user.getLogin());

            if (passwordEncoder.matches(request.getPassword(), userDetails.getPassword())) {
                return new ResponseEntity<>(request.getCheckUUID(), HttpStatus.OK);
            } else {
                return new ResponseEntity<>(request.getCheckUUID(), HttpStatus.BAD_REQUEST);
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    @PostMapping("/authenticateFederationServiceManager")
    public ResponseEntity<JWTToken> authorizeFederationServiceManager(@Valid @RequestBody String token) {
        final String ctx = CLASSNAME + ".authorizeFederationServiceManager";
        try {
            if (!StringUtils.hasText(token))
                throw new InvalidConnectionKeyException("It's needed to provide a connection key");

            UtmFederationServiceClient fsToken = fsClientRepository.findByFsClientToken(token)
                    .orElseThrow(() -> new InvalidConnectionKeyException("Unrecognized connection key"));

            String[] tokenInfo = new String(Base64.getUrlDecoder().decode(fsToken.getFsClientToken())).split("\\|");

            if (tokenInfo.length != 2)
                throw new InvalidConnectionKeyException("Connection key is corrupt, length is invalid");

            /*if (!tokenInfo[0].equals(System.getenv(Constants.ENV_SERVER_NAME)))
                throw new InvalidConnectionKeyException("Connection key is corrupt, unrecognized instance");*/

            UsernamePasswordAuthenticationToken authenticationToken =
                    new UsernamePasswordAuthenticationToken(Constants.FS_USER, CipherUtil.decrypt(tokenInfo[1], System.getenv(Constants.ENV_ENCRYPTION_KEY)));

            Authentication authentication = this.authenticationManager.authenticate(authenticationToken);
            SecurityContextHolder.getContext().setAuthentication(authentication);

            String jwt = tokenProvider.createToken(authentication, true, true);

            HttpHeaders httpHeaders = new HttpHeaders();
            httpHeaders.add(JWTFilter.AUTHORIZATION_HEADER, "Bearer " + jwt);

            return new ResponseEntity<>(new JWTToken(jwt, true), httpHeaders, HttpStatus.OK);
        } catch (InvalidConnectionKeyException e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildBadRequestResponse(msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildInternalServerErrorResponse(msg);
        }
    }
}
