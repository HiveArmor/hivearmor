package com.hivearmor.web.rest.tfa;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.Authority;
import com.hivearmor.domain.User;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.UserService;
import com.hivearmor.service.UtmConfigurationParameterService;
import com.hivearmor.service.dto.jwt.LoginResponseDTO;
import com.hivearmor.service.dto.tfa.enroll.TfaEnrollRequest;
import com.hivearmor.service.dto.tfa.init.TfaInitResponse;
import com.hivearmor.service.dto.tfa.save.TfaSaveRequest;
import com.hivearmor.service.dto.tfa.verify.TfaVerifyResponse;
import com.hivearmor.service.tfa.TfaService;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.util.exceptions.InvalidTfaStageException;
import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

import static com.hivearmor.config.Constants.PROP_TFA_METHOD;

@RestController
@RequiredArgsConstructor
@Slf4j
@Hidden
@RequestMapping("api/enrollment/tfa")
public class TfaEnrollmentResource {

    private static final String CLASSNAME = "TfaEnrollmentController";

    private final UserService userService;
    private final TfaService tfaService;
    private final UtmConfigurationParameterService utmConfigurationParameterService;
    private final TokenProvider tokenProvider;


    @PostMapping
    public ResponseEntity<?> enrollTfa(@RequestBody TfaEnrollRequest request) {
        User user = userService.getCurrentUserLogin();

            return switch (request.getStage()) {
                case INIT -> {
                    TfaInitResponse initResponse = tfaService.initiateSetup(user, request.getMethod());
                    yield ResponseEntity.ok(initResponse);
                }
                case VERIFY -> {
                    TfaVerifyResponse verifyResponse = tfaService.verifyCode(user, request.toVerifyRequest());
                    yield ResponseEntity.ok(verifyResponse);
                }
                case COMPLETE -> {
                    List<UtmConfigurationParameter> tfaParams = utmConfigurationParameterService
                            .getConfigParameterBySectionId(Constants.TFA_SETTING_ID);

                    for (UtmConfigurationParameter param : tfaParams) {
                        switch (param.getConfParamShort()) {
                            case PROP_TFA_METHOD:
                                param.setConfParamValue(String.valueOf(request.getMethod()));
                                break;
                            case Constants.PROP_TFA_ENABLE:
                                param.setConfParamValue(String.valueOf(request.isEnable()));
                                break;
                        }
                    }

                    tfaService.persistConfiguration(request.getMethod());
                    utmConfigurationParameterService.saveAllConfigParams(tfaParams);
                    List<SimpleGrantedAuthority> authorities = user.getAuthorities().stream()
                            .map(Authority::getName)
                            .map(SimpleGrantedAuthority::new)
                            .collect(Collectors.toList());

                    org.springframework.security.core.userdetails.User principal =
                            new org.springframework.security.core.userdetails.User(user.getLogin(), "", authorities);

                    UsernamePasswordAuthenticationToken fullAuth =
                            new UsernamePasswordAuthenticationToken(principal, "", authorities);


                    String fullToken = tokenProvider.createToken(fullAuth, false, true );

                    LoginResponseDTO response = LoginResponseDTO.builder()
                            .token(fullToken)
                            .method(user.getTfaMethod())
                            .success(true)
                            .tfaConfigured(true)
                            .forceTfa(true)
                            .build();

                    yield ResponseEntity.ok(response);
                }
                default -> throw new InvalidTfaStageException("Invalid TFA stage: " + request.getStage());
            };
    }
}

