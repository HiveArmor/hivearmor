package com.hivearmor.userauditor;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies Java 17 runtime and that the compiled bytecode is valid.
 * Does not start the Spring context — ApplicationStartProcessor requires live DB/ES.
 */
class UpgradeSmokeTest {

    @Test
    void javaVersionIs17OrHigher() {
        int version = Runtime.version().feature();
        assertThat(version).isGreaterThanOrEqualTo(17);
    }

    @Test
    void mainClassIsPresent() throws ClassNotFoundException {
        Class<?> cls = Class.forName("com.hivearmor.userauditor.UserAuditorApplication");
        assertThat(cls).isNotNull();
    }
}
