package com.livesync.api.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.livesync.api.dto.DocumentDtos.ExecutionLanguageDescriptor;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class SandboxExecutionClient {
    private static final Logger log = LoggerFactory.getLogger(SandboxExecutionClient.class);
    public record SandboxRequest(String language, String code, String standardInput) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SandboxResponse(String language, String status, boolean isSuccess, String message, String standardOutput, String standardError, Integer exitCode, Double executionDurationMs, Long peakMemoryBytes, Double cpuTimeMs, String timeComplexity, String spaceComplexity, String complexityExplanation, Instant requestedAt, Instant completedAt) {}

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
            String body = json.writeValueAsString(payload);
            if (body == null || body.isBlank()) {
                throw new IllegalStateException("Sandbox execution payload is empty.");
            }
            log.info("Sending sandbox execution request body length={}", body.length());
            var request = HttpRequest.newBuilder(base.resolve("api/execution/run"))
                .version(HttpClient.Version.HTTP_1_1)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
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

    public com.livesync.api.dto.DocumentDtos.AiAnalysisResponse analyzeAi(String action, String language, String code, String prompt) {
        try {
            var payload = new java.util.HashMap<String, String>();
            payload.put("action", action);
            payload.put("language", language);
            payload.put("code", code);
            if (prompt != null && !prompt.isBlank()) {
                payload.put("prompt", prompt);
            }
            String body = json.writeValueAsString(payload);
            var request = HttpRequest.newBuilder(base.resolve("api/ai/analyze"))
                .version(HttpClient.Version.HTTP_1_1)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException("Sandbox AI returned HTTP " + response.statusCode() + ": " + response.body());
            }
            return json.readValue(response.body(), com.livesync.api.dto.DocumentDtos.AiAnalysisResponse.class);
        } catch (Exception exception) {
            log.error("AI assistant request failed", exception);
            return new com.livesync.api.dto.DocumentDtos.AiAnalysisResponse(action, language, "### AI Assistant Error\n\nUnable to complete AI analysis: " + exception.getMessage(), List.of("Try re-submitting request."), null);
        }
    }

    private SandboxResponse tryParseSandboxResponse(String body) {
        try {
            return json.readValue(body, SandboxResponse.class);
        } catch (Exception exception) {
            return null;
        }
    }
}
