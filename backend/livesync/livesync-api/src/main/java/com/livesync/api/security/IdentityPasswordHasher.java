package com.livesync.api.security;

import org.springframework.stereotype.Component;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.KeySpec;

@Component
public class IdentityPasswordHasher {
    private static final int SALT_LENGTH = 16, SUBKEY_LENGTH = 32, ITERATIONS = 100_000, PRF_HMAC_SHA512 = 2;

    public String hash(String password) {
        try {
            byte[] salt = new byte[SALT_LENGTH];
            new SecureRandom().nextBytes(salt);
            byte[] subkey = derive(password, salt, ITERATIONS, "PBKDF2WithHmacSHA512");
            ByteBuffer bytes = ByteBuffer.allocate(13 + salt.length + subkey.length);
            bytes.put((byte) 1).putInt(PRF_HMAC_SHA512).putInt(ITERATIONS).putInt(salt.length).put(salt).put(subkey);
            return java.util.Base64.getEncoder().encodeToString(bytes.array());
        } catch (java.security.GeneralSecurityException exception) {
            throw new IllegalStateException("Unable to hash password.", exception);
        }
    }

    public boolean matches(String password, String encoded) {
        try {
            byte[] bytes = java.util.Base64.getDecoder().decode(encoded);
            if (bytes.length < 13 || bytes[0] != 1) return false;
            ByteBuffer input = ByteBuffer.wrap(bytes);
            input.get();
            int prf = input.getInt(), iterations = input.getInt(), saltLength = input.getInt();
            if (saltLength < 16 || bytes.length - 13 - saltLength < 16) return false;
            byte[] salt = new byte[saltLength], expected = new byte[bytes.length - 13 - saltLength];
            input.get(salt).get(expected);
            String algorithm = switch (prf) {
                case 0 -> "PBKDF2WithHmacSHA1";
                case 1 -> "PBKDF2WithHmacSHA256";
                case 2 -> "PBKDF2WithHmacSHA512";
                default -> null;
            };
            return algorithm != null && MessageDigest.isEqual(expected, derive(password, salt, iterations, algorithm));
        } catch (IllegalArgumentException | java.security.GeneralSecurityException exception) {
            return false;
        }
    }

    private byte[] derive(String password, byte[] salt, int iterations, String algorithm) throws java.security.GeneralSecurityException {
        KeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, SUBKEY_LENGTH * 8);
        return SecretKeyFactory.getInstance(algorithm).generateSecret(spec).getEncoded();
    }

}
