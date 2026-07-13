package com.hivearmor.service.login_attempts;

import com.google.common.cache.CacheBuilder;
import com.google.common.cache.CacheLoader;
import com.google.common.cache.LoadingCache;
import com.hivearmor.security.TrustedProxyResolver;
import org.jetbrains.annotations.NotNull;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletRequest;
import java.util.concurrent.TimeUnit;

@Service
public class LoginAttemptService {
    private static final String CLASSNAME = "LoginAttemptService";

    public static final int MAX_ATTEMPT = 10;

    private final LoadingCache<String, Integer> attemptsCache;
    private final HttpServletRequest request;
    private final TrustedProxyResolver proxyResolver;

    public LoginAttemptService(HttpServletRequest request, TrustedProxyResolver proxyResolver) {
        this.request = request;
        this.proxyResolver = proxyResolver;
        attemptsCache = CacheBuilder.newBuilder().expireAfterWrite(10, TimeUnit.MINUTES).build(new CacheLoader<>() {
            @NotNull
            @Override
            public Integer load(@NotNull final String key) {
                return 0;
            }
        });
    }

    public void registerFailedLogin(String clientIp) {
        final String ctx = CLASSNAME + ".registerFailedLogin";
        try {
            int attempts;
            try {
                attempts = attemptsCache.get(clientIp);
            } catch (Exception e) {
                attempts = 0;
            }
            attempts++;
            attemptsCache.put(clientIp, attempts);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    public void registerSuccessfulLogin(String clientIp) {
        final String ctx = CLASSNAME + ".registerSuccessfulLogin";
        try {
            attemptsCache.put(clientIp, 0);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    public boolean isBlocked() {
        final String ctx = CLASSNAME + ".isBlocked";
        try {
            return attemptsCache.get(getClientIP()) >= MAX_ATTEMPT;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    public String getClientIP() {
        final String ctx = CLASSNAME + ".getClientIP";
        try {
            return proxyResolver.resolveClientIp(request);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }
}
