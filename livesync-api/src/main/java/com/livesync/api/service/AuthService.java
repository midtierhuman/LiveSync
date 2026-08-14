package com.livesync.api.service;

import com.livesync.api.dto.AuthDtos.AuthResponse;
import com.livesync.api.dto.AuthDtos.LoginRequest;
import com.livesync.api.dto.AuthDtos.RegisterRequest;
import com.livesync.api.dto.AuthDtos.UserInfo;
import com.livesync.api.model.ApplicationUser;
import com.livesync.api.repository.ApplicationUserRepository;
import com.livesync.api.security.IdentityPasswordHasher;
import com.livesync.api.security.JwtService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class AuthService {
    private final ApplicationUserRepository users;
    private final IdentityPasswordHasher passwords;
    private final JwtService jwt;

    public AuthService(ApplicationUserRepository users, IdentityPasswordHasher passwords, JwtService jwt) {
        this.users = users;
        this.passwords = passwords;
        this.jwt = jwt;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (!request.password().equals(request.confirmPassword())) return failure("Passwords do not match.");
        if (!validPassword(request.password()))
            return failure("Registration failed: Passwords must have at least one digit ('0'-'9'), one lowercase ('a'-'z'), and one uppercase ('A'-'Z').");
        String email = request.email().trim(), normalized = email.toUpperCase(Locale.ROOT);
        if (users.findByNormalizedEmail(normalized).isPresent()) return failure("User with this email already exists.");
        var user = new ApplicationUser();
        user.setId(UUID.randomUUID().toString());
        user.setEmail(email);
        String preferredUserName = request.firstName() != null && !request.firstName().isBlank()
                ? request.firstName().trim()
                : email;
        user.setUserName(preferredUserName);
        user.setNormalizedEmail(normalized);
        user.setNormalizedUserName(preferredUserName.toUpperCase(Locale.ROOT));
        user.setPasswordHash(passwords.hash(request.password()));
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setCreatedAt(Instant.now());
        user.setSecurityStamp(UUID.randomUUID().toString());
        user.setConcurrencyStamp(UUID.randomUUID().toString());
        user.setLockoutEnabled(true);
        users.save(user);
        return success(user, "Registration successful.");
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        String key = request.emailOrUsername().trim().toUpperCase(Locale.ROOT);
        var user = users.findByNormalizedEmail(key).or(() -> users.findByNormalizedUserName(key));
        if (user.isEmpty()) return failure("Invalid credentials.");
        var account = user.get();
        if (account.getLockoutEnd() != null) {
            if (account.getLockoutEnd().isAfter(Instant.now())) {
                return failure("Account is locked out. Please try again later.");
            } else {
                account.setLockoutEnd(null);
                account.setAccessFailedCount(0);
            }
        }
        if (!passwords.matches(request.password(), account.getPasswordHash())) {
            if (account.isLockoutEnabled()) {
                account.setAccessFailedCount(account.getAccessFailedCount() + 1);
                if (account.getAccessFailedCount() >= 5) account.setLockoutEnd(Instant.now().plusSeconds(300));
                users.save(account);
            }
            return failure("Invalid credentials.");
        }
        account.setAccessFailedCount(0);
        account.setLockoutEnd(null);
        account.setLastLoginAt(Instant.now());
        users.save(account);
        return success(account, "Login successful.");
    }

    public AuthResponse notImplemented(String provider) {
        return failure(provider + " OAuth login not yet implemented.");
    }

    public AuthResponse refresh() {
        return failure("Refresh token functionality not yet implemented.");
    }

    private AuthResponse success(ApplicationUser user, String message) {
        return new AuthResponse(true, message, jwt.generate(user), jwt.expiration(), new UserInfo(user.getId(), user.getEmail(), user.getUserName(), user.getFirstName(), user.getLastName()));
    }

    private AuthResponse failure(String message) {
        return new AuthResponse(false, message, null, null, null);
    }

    private boolean validPassword(String password) {
        return password != null
                && password.length() >= 6
                && password.chars().anyMatch(Character::isDigit)
                && password.chars().anyMatch(Character::isLowerCase)
                && password.chars().anyMatch(Character::isUpperCase);
    }
}