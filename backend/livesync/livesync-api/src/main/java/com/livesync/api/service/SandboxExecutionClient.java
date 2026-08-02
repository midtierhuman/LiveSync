package com.livesync.api.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.livesync.api.dto.DocumentDtos.ExecutionLanguageDescriptor;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class SandboxExecutionClient {
    public record SandboxRequest(String language, String code, String standardInput) {}
    public record SandboxResponse(String language, String status, boolean isSuccess, String message, String standardOutput, String standardError, Integer exitCode, Instant requestedAt, Instant completedAt) {}
    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json; private final URI base;
    public SandboxExecutionClient(ObjectMapper json, @Value("${livesync.sandbox.base-url}") String baseUrl) { this.json = json; this.base = URI.create(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"); }
    public List<ExecutionLanguageDescriptor> languages() {
        try {
            var request = HttpRequest.newBuilder(base.resolve("api/execution/languages")).GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException("Sandbox returned HTTP " + response.statusCode() + ": " + response.body());
            }
            return json.readValue(response.body(), new TypeReference<>() {});
        } catch (Exception exception) { throw new IllegalStateException("Unable to retrieve sandbox languages.", exception); }
    }
    public SandboxResponse execute(SandboxRequest payload) {
        try {
            var request = HttpRequest.newBuilder(base.resolve("api/execution/run")).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            var parsed = tryParseSandboxResponse(response.body());
            if (response.statusCode() / 100 != 2) {
                if (parsed != null) {
                    return parsed;
                }
                throw new IllegalStateException("Sandbox returned HTTP " + response.statusCode() + ": " + response.body());
            }
            if (parsed == null) {
                throw new IllegalStateException("Sandbox returned malformed response: " + response.body());
            }
            return parsed;
        } catch (Exception exception) { throw new IllegalStateException("Sandbox execution request failed.", exception); }
    }

    private SandboxResponse tryParseSandboxResponse(String body) {
        try {
            return json.readValue(body, SandboxResponse.class);
        } catch (Exception exception) {
            return null;
        }
    }
}
