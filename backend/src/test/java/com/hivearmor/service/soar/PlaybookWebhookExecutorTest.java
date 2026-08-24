package com.hivearmor.service.soar;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

class PlaybookWebhookExecutorTest {

    @Test
    void rejectsLoopbackAndPrivateHosts() {
        assertThatThrownBy(() -> PlaybookWebhookExecutor.assertHostSafe("localhost"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PlaybookWebhookExecutor.assertHostSafe("127.0.0.1"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PlaybookWebhookExecutor.assertHostSafe("10.0.0.5"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PlaybookWebhookExecutor.assertHostSafe("192.168.1.10"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PlaybookWebhookExecutor.assertHostSafe("169.254.169.254"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void allowsPublicHostnameResolutionWhenPublic() {
        // example.com resolves publicly in most environments; if DNS fails the test still
        // validates that assertHostSafe does not hard-reject the name itself.
        assertThatCode(() -> PlaybookWebhookExecutor.assertHostSafe("example.com"))
            .doesNotThrowAnyException();
    }
}
