package com.livesync.api.service;

import com.livesync.api.dto.AuthDtos.*;
import com.livesync.api.model.ApplicationUser;
import com.livesync.api.repository.ApplicationUserRepository;
import com.livesync.api.security.IdentityPasswordHasher;
import com.livesync.api.security.JwtService;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final ApplicationUserRepository users; private final IdentityPasswordHasher passwords; private final JwtService jwt;
    public AuthService(ApplicationUserRepository users, IdentityPasswordHasher passwords, JwtService jwt) { this.users = users; this.passwords = passwords; this.jwt = jwt; }
    @Transactional public AuthResponse register(RegisterRequest request) {
        if (!request.password().equals(request.confirmPassword())) return failure("Passwords do not match.");
        if (!validPassword(request.password())) return failure("Registration failed: Passwords must have at least one digit ('0'-'9'), one lowercase ('a'-'z'), and one uppercase ('A'-'Z').");
        String email = request.email().trim(), normalized = email.toUpperCase(Locale.ROOT);
        if (users.findByNormalizedEmail(normalized).isPresent()) return failure("User with this email already exists.");
        var user = new ApplicationUser();
        user.setId(UUID.randomUUID().toString()); user.setEmail(email); user.setUserName(email); user.setNormalizedEmail(normalized); user.setNormalizedUserName(normalized);
        user.setPasswordHash(passwords.hash(request.password())); user.setFirstName(request.firstName()); user.setLastName(request.lastName()); user.setCreatedAt(Instant.now());
        user.setSecurityStamp(UUID.randomUUID().toString()); user.setConcurrencyStamp(UUID.randomUUID().toString()); user.setLockoutEnabled(true);
        users.save(user); return success(user, "Registration successful.");
    }
    @Transactional public AuthResponse login(LoginRequest request) {
        String key = request.emailOrUsername().trim().toUpperCase(Locale.ROOT);
        var user = users.findByNormalizedEmail(key).or(() -> users.findByNormalizedUserName(key));
        if (user.isEmpty()) return failure("Invalid credentials.");
        var account = user.get();
        if (account.getLockoutEnd() != null && account.getLockoutEnd().isAfter(Instant.now())) return failure("Account is locked out. Please try again later.");
        if (!passwords.matches(request.password(), account.getPasswordHash())) {
            if (account.isLockoutEnabled()) {
                account.setAccessFailedCount(account.getAccessFailedCount() + 1);
                if (account.getAccessFailedCount() >= 5) account.setLockoutEnd(Instant.now().plusSeconds(300));
                users.save(account);
            }
            return failure("Invalid credentials.");
        }
        account.setAccessFailedCount(0); account.setLockoutEnd(null); account.setLastLoginAt(Instant.now()); users.save(account); return success(account, "Login successful.");
    }
    public AuthResponse notImplemented(String provider) { return failure(provider + " OAuth login not yet implemented."); }
    public AuthResponse refresh() { return failure("Refresh token functionality not yet implemented."); }
    private AuthResponse success(ApplicationUser user, String message) {
        return new AuthResponse(true, message, jwt.generate(user), jwt.expiration(), new UserInfo(user.getId(), user.getEmail(), user.getUserName(), user.getFirstName(), user.getLastName()));
    }
    private AuthResponse failure(String message) { return new AuthResponse(false, message, null, null, null); }
    private boolean validPassword(String password) {
        return password.chars().anyMatch(Character::isDigit)
            && password.chars().anyMatch(Character::isLowerCase)
            && password.chars().anyMatch(Character::isUpperCase);
    }
}
