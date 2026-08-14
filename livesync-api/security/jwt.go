package security

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/livesync/livesync-api/models"
)

type JWTService struct {
	secret          []byte
	issuer          string
	audience        string
	expirationHours int
}

type UserClaims struct {
	UserID     string `json:"sub"`
	UserName   string `json:"unique_name"`
	Email      string `json:"email"`
	jwt.RegisteredClaims
}

func NewJWTService(secret, issuer, audience string, expirationHours int) (*JWTService, error) {
	if len(secret) < 32 {
		return nil, errors.New("JWT secret must be at least 32 bytes")
	}
	return &JWTService{
		secret:          []byte(secret),
		issuer:          issuer,
		audience:        audience,
		expirationHours: expirationHours,
	}, nil
}

func (j *JWTService) Generate(user *models.ApplicationUser) (string, time.Time, error) {
	exp := time.Now().Add(time.Duration(j.expirationHours) * time.Hour)

	var userName, email string
	if user.UserName != nil {
		userName = *user.UserName
	}
	if user.Email != nil {
		email = *user.Email
	}

	claims := UserClaims{
		UserID:   user.ID,
		UserName: userName,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			Issuer:    j.issuer,
			Audience:  jwt.ClaimStrings{j.audience},
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(j.secret)
	if err != nil {
		return "", exp, fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, exp, nil
}

func (j *JWTService) Parse(tokenStr string) (*UserClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secret, nil
	}, jwt.WithIssuer(j.issuer), jwt.WithAudience(j.audience))

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*UserClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token claims")
}
