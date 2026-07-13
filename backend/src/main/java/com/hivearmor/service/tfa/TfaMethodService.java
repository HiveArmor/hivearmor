package com.hivearmor.service.tfa;

import com.hivearmor.domain.User;
import com.hivearmor.domain.tfa.TfaMethod;
import com.hivearmor.service.dto.tfa.init.TfaInitResponse;
import com.hivearmor.service.dto.tfa.verify.TfaVerifyResponse;

public interface TfaMethodService {
    TfaMethod getMethod();

    TfaInitResponse initiateSetup(User use);

    TfaVerifyResponse verifyCode(User use, String code);

    void persistConfiguration(User use);

    void generateChallenge(User user);

    void regenerateChallenge(User user);

    long expirationTimeSeconds();

}

