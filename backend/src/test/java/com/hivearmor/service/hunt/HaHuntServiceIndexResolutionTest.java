package com.hivearmor.service.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HaHuntServiceIndexResolutionTest {

    @Test
    @SuppressWarnings("unchecked")
    void allSourcesIncludeLogAndAlertPatterns() throws Exception {
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        when(resolver.resolveIndexPattern("log")).thenReturn("v3-hive-log-*");
        when(resolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-*");
        HaHuntService service = new HaHuntService(null, resolver, null, null, null, null);

        Method method = HaHuntService.class.getDeclaredMethod("resolveIndices", String.class);
        method.setAccessible(true);
        List<String> all = (List<String>) method.invoke(service, "all");
        List<String> alerts = (List<String>) method.invoke(service, "alert");

        assertThat(all).containsExactly("v3-hive-log-*", "v3-hive-alert-*");
        assertThat(alerts).containsExactly("v3-hive-alert-*");
    }
}
