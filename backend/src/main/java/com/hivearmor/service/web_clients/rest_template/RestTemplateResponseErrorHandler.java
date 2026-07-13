package com.hivearmor.service.web_clients.rest_template;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.DefaultResponseErrorHandler;
import org.springframework.web.client.RestClientResponseException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.stream.Collectors;

/**
 * Phase 6b: Spring 6 changed ClientHttpResponse.getStatusCode() to return
 * HttpStatusCode instead of HttpStatus. Updated accordingly.
 */
@Component
public class RestTemplateResponseErrorHandler extends DefaultResponseErrorHandler {

    @Override
    public void handleError(ClientHttpResponse response) throws IOException {
        HttpStatusCode statusCode = response.getStatusCode();
        if (statusCode.is4xxClientError() || statusCode.is5xxServerError()) {
            BufferedReader reader = new BufferedReader(new InputStreamReader(response.getBody()));
            String httpBodyResponse = reader.lines().collect(Collectors.joining(""));
            throw new RestClientResponseException(
                    String.format("Error with status: %1$s and message: %2$s",
                            statusCode.value(), httpBodyResponse),
                    statusCode.value(),
                    response.getStatusText(),
                    null, null, null);
        }
    }
}
