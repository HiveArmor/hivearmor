package com.hivearmor.service.tfa;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.User;
import com.hivearmor.domain.tfa.TfaMethod;
import com.hivearmor.service.UserService;
import com.hivearmor.service.dto.tfa.init.TfaInitResponse;
import com.hivearmor.service.dto.tfa.verify.TfaVerifyRequest;
import com.hivearmor.service.dto.tfa.verify.TfaVerifyResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class TfaService {

    private final List<TfaMethodService> methodServices;
    private final UserService userService;

    private TfaMethodService getMethodService(TfaMethod method) {
        return methodServices.stream()
                .filter(service -> service.getMethod().equals(method))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("TFA method not supported: " + method));
    }

    public TfaInitResponse initiateSetup(User user, TfaMethod method) {
        TfaMethodService selected = getMethodService(method);
        return selected.initiateSetup(user);
    }

    public TfaVerifyResponse verifyCode(User user, TfaVerifyRequest request) {
        TfaMethodService selected = getMethodService(request.getMethod());
        return selected.verifyCode(user, request.getCode());
    }

    public void persistConfiguration(TfaMethod method) {
        User user = userService.getCurrentUserLogin();
        TfaMethodService selected = getMethodService(method);
        selected.persistConfiguration(user);
    }

    public long generateChallenge(User user) {

        TfaMethod method = TfaMethod.valueOf(user.getTfaMethod());

        TfaMethodService selected = getMethodService(method);
        selected.generateChallenge(user);

        return selected.expirationTimeSeconds();
    }

    public void regenerateChallenge(User user) {

        TfaMethod method = TfaMethod.valueOf(user.getTfaMethod());

        TfaMethodService selected = getMethodService(method);
        selected.regenerateChallenge(user);
    }
}

