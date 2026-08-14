package security

import (
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"hash"

	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/pbkdf2"
)

const (
	SaltLength   = 16
	SubkeyLength = 32
	Iterations   = 100000
	PrfHmacSha512 = 2
)

type PasswordHasher struct{}

func NewPasswordHasher() *PasswordHasher {
	return &PasswordHasher{}
}

// Hash generates an ASP.NET Core Identity v3 PBKDF2-HMAC-SHA512 compatible password hash.
func (p *PasswordHasher) Hash(password string) (string, error) {
	salt := make([]byte, SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	subkey := pbkdf2.Key([]byte(password), salt, Iterations, SubkeyLength, sha512.New)

	// Allocate: 1 (version) + 4 (prf) + 4 (iterations) + 4 (salt length) + salt + subkey = 13 + 16 + 32 = 61 bytes
	buf := make([]byte, 13+len(salt)+len(subkey))
	buf[0] = 0x01 // Version 3
	binary.BigEndian.PutUint32(buf[1:5], uint32(PrfHmacSha512))
	binary.BigEndian.PutUint32(buf[5:9], uint32(Iterations))
	binary.BigEndian.PutUint32(buf[9:13], uint32(len(salt)))
	copy(buf[13:13+len(salt)], salt)
	copy(buf[13+len(salt):], subkey)

	return base64.StdEncoding.EncodeToString(buf), nil
}

// Matches verifies a password against an ASP.NET Identity v3 PBKDF2 hash or BCrypt hash.
func (p *PasswordHasher) Matches(password, encodedHash string) bool {
	if encodedHash == "" {
		return false
	}

	// Check if this is an ASP.NET Core Identity V3 base64 payload
	decoded, err := base64.StdEncoding.DecodeString(encodedHash)
	if err == nil && len(decoded) >= 13 && decoded[0] == 0x01 {
		prf := binary.BigEndian.Uint32(decoded[1:5])
		iter := binary.BigEndian.Uint32(decoded[5:9])
		saltLen := int(binary.BigEndian.Uint32(decoded[9:13]))

		if saltLen >= 16 && len(decoded) >= 13+saltLen+16 {
			salt := decoded[13 : 13+saltLen]
			expectedSubkey := decoded[13+saltLen:]

			var h func() hash.Hash
			switch prf {
			case 0:
				h = sha1.New
			case 1:
				h = sha256.New
			case 2:
				h = sha512.New
			default:
				return false
			}

			actualSubkey := pbkdf2.Key([]byte(password), salt, int(iter), len(expectedSubkey), h)
			return subtle.ConstantTimeCompare(expectedSubkey, actualSubkey) == 1
		}
	}

	// Fallback check for BCrypt format ($2a$, $2b$, $2y$)
	if len(encodedHash) >= 4 && (encodedHash[:4] == "$2a$" || encodedHash[:4] == "$2b$" || encodedHash[:4] == "$2y$") {
		return bcrypt.CompareHashAndPassword([]byte(encodedHash), []byte(password)) == nil
	}

	return false
}

func ValidatePasswordStrength(password string) error {
	if len(password) < 6 {
		return errors.New("Registration failed: Passwords must have at least 6 characters.")
	}
	var hasDigit, hasLower, hasUpper bool
	for _, c := range password {
		if c >= '0' && c <= '9' {
			hasDigit = true
		} else if c >= 'a' && c <= 'z' {
			hasLower = true
		} else if c >= 'A' && c <= 'Z' {
			hasUpper = true
		}
	}
	if !hasDigit || !hasLower || !hasUpper {
		return errors.New("Registration failed: Passwords must have at least one digit ('0'-'9'), one lowercase ('a'-'z'), and one uppercase ('A'-'Z').")
	}
	return nil
}
