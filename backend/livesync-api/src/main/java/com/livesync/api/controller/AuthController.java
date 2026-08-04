package com.livesync.api.controller;

import com.livesync.api.dto.AuthDtos.*;
import com.livesync.api.security.JwtService;
import com.livesync.api.service.AuthService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final JwtService jwt;

    public AuthController(AuthService auth, JwtService jwt) {
        this.auth = auth;
        this.jwt = jwt;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        var response = auth.register(request);
        return ResponseEntity.status(response.success() ? HttpStatus.OK : HttpStatus.BAD_REQUEST).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        var response = auth.login(request);
        return ResponseEntity.status(response.success() ? HttpStatus.OK : HttpStatus.UNAUTHORIZED).body(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestBody(required = false) String token) {
        if (token == null || token.isBlank())
            return ResponseEntity.badRequest().body(new AuthResponse(false, "Token is required.", null, null, null));
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(auth.refresh());
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader(value = "Authorization", required = false) String header) {
        if (header == null || !header.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(java.util.Map.of("message", "Authorization token is missing or malformed."));
        }
        try {
            Claims claims = jwt.parse(header.substring(7));
            return ResponseEntity.ok(new UserInfo(claims.getSubject(), claims.get("email", String.class), claims.get("unique_name", String.class), null, null));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(java.util.Map.of("message", "Invalid or expired token."));
        }
    }

    @PostMapping("/oauth/{provider}")
    public ResponseEntity<AuthResponse> oauth(@PathVariable String provider, @Valid @RequestBody OAuthLoginRequest request) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(auth.notImplemented(provider.substring(0, 1).toUpperCase() + provider.substring(1).toLowerCase()));
    }
}
