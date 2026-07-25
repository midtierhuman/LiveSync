package com.livesync.api.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;

public final class AuthDtos {
    private AuthDtos() {}
    public record RegisterRequest(@NotBlank @Email String email, @NotBlank @Size(min = 6, max = 100) String password,
                                  @NotBlank String confirmPassword, @Size(max = 50) String firstName, @Size(max = 50) String lastName) {}
    public record LoginRequest(@NotBlank String emailOrUsername, @NotBlank String password, boolean rememberMe) {}
    public record OAuthLoginRequest(@NotBlank String provider, @NotBlank String accessToken) {}
    public record UserInfo(String id, String email, String userName, String firstName, String lastName) {}
    public record AuthResponse(boolean success, String message, String token, Instant expiration, UserInfo user) {}
}
