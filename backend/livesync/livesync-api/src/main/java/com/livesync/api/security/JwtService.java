package com.livesync.api.security;

import com.livesync.api.model.ApplicationUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {
    private final SecretKey key;
    private final String issuer;
    private final String audience;
    private final long expirationHours;

    public JwtService(@Value("${livesync.jwt.secret}") String secret, @Value("${livesync.jwt.issuer}") String issuer,
                      @Value("${livesync.jwt.audience}") String audience, @Value("${livesync.jwt.expiration-hours}") long expirationHours) {
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32)
            throw new IllegalStateException("livesync.jwt.secret must be at least 32 bytes.");
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.issuer = issuer;
        this.audience = audience;
        this.expirationHours = expirationHours;
    }

    public String generate(ApplicationUser user) {
        Instant expiry = Instant.now().plusSeconds(expirationHours * 3600);
        return Jwts.builder().subject(user.getId()).issuer(issuer).audience().add(audience).and()
                .claim("unique_name", user.getUserName()).claim("email", user.getEmail())
                .issuedAt(new Date()).expiration(Date.from(expiry)).signWith(key).compact();
    }

    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).requireIssuer(issuer).requireAudience(audience).build().parseSignedClaims(token).getPayload();
    }

    public Instant expiration() {
        return Instant.now().plusSeconds(expirationHours * 3600);
    }
}

