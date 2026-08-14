package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/livesync/livesync-api/database"
	"github.com/livesync/livesync-api/models"
	"github.com/livesync/livesync-api/security"
)

type AuthService struct {
	db       *database.DB
	jwt      *security.JWTService
	password *security.PasswordHasher
}

func NewAuthService(db *database.DB, jwt *security.JWTService, password *security.PasswordHasher) *AuthService {
	return &AuthService{
		db:       db,
		jwt:      jwt,
		password: password,
	}
}

func (s *AuthService) Register(ctx context.Context, req *models.RegisterRequest) (*models.AuthResponse, error) {
	if req.Password != req.ConfirmPassword {
		return &models.AuthResponse{Success: false, Message: "Passwords do not match."}, nil
	}

	if err := security.ValidatePasswordStrength(req.Password); err != nil {
		return &models.AuthResponse{Success: false, Message: err.Error()}, nil
	}

	email := strings.TrimSpace(req.Email)
	normalizedEmail := strings.ToUpper(email)

	// Check if user already exists
	var exists bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM "AspNetUsers" WHERE "NormalizedEmail" = $1);`
	err := s.db.Pool.QueryRow(ctx, checkQuery, normalizedEmail).Scan(&exists)
	if err != nil {
		return nil, err
	}
	if exists {
		return &models.AuthResponse{Success: false, Message: "User with this email already exists."}, nil
	}

	preferredUserName := email
	if strings.TrimSpace(req.FirstName) != "" {
		preferredUserName = strings.TrimSpace(req.FirstName)
	}
	normalizedUserName := strings.ToUpper(preferredUserName)

	hashedPassword, err := s.password.Hash(req.Password)
	if err != nil {
		return nil, err
	}

	user := &models.ApplicationUser{
		ID:                   uuid.New().String(),
		Email:                &email,
		UserName:             &preferredUserName,
		PasswordHash:         &hashedPassword,
		FirstName:            &req.FirstName,
		LastName:             &req.LastName,
		CreatedAt:            time.Now(),
		NormalizedEmail:      &normalizedEmail,
		NormalizedUserName:   &normalizedUserName,
		EmailConfirmed:       false,
		SecurityStamp:        ptr(uuid.New().String()),
		ConcurrencyStamp:     ptr(uuid.New().String()),
		PhoneNumberConfirmed: false,
		TwoFactorEnabled:     false,
		LockoutEnabled:       true,
		AccessFailedCount:    0,
	}

	insertQuery := `
		INSERT INTO "AspNetUsers" (
			"Id", "Email", "UserName", "PasswordHash", "FirstName", "LastName",
			"CreatedAt", "NormalizedEmail", "NormalizedUserName", "EmailConfirmed",
			"SecurityStamp", "ConcurrencyStamp", "PhoneNumberConfirmed", "TwoFactorEnabled",
			"LockoutEnabled", "AccessFailedCount"
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16);
	`

	_, err = s.db.Pool.Exec(ctx, insertQuery,
		user.ID, user.Email, user.UserName, user.PasswordHash, user.FirstName, user.LastName,
		user.CreatedAt, user.NormalizedEmail, user.NormalizedUserName, user.EmailConfirmed,
		user.SecurityStamp, user.ConcurrencyStamp, user.PhoneNumberConfirmed, user.TwoFactorEnabled,
		user.LockoutEnabled, user.AccessFailedCount,
	)
	if err != nil {
		return nil, err
	}

	token, exp, err := s.jwt.Generate(user)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{
		Success:    true,
		Message:    "Registration successful.",
		Token:      &token,
		Expiration: &exp,
		User: &models.UserInfo{
			ID:        user.ID,
			Email:     user.Email,
			UserName:  user.UserName,
			FirstName: user.FirstName,
			LastName:  user.LastName,
		},
	}, nil
}

func (s *AuthService) Login(ctx context.Context, req *models.LoginRequest) (*models.AuthResponse, error) {
	key := strings.ToUpper(strings.TrimSpace(req.EmailOrUsername))

	query := `
		SELECT "Id", "Email", "UserName", "PasswordHash", "FirstName", "LastName",
		       "CreatedAt", "LastLoginAt", "NormalizedEmail", "NormalizedUserName",
		       "EmailConfirmed", "SecurityStamp", "ConcurrencyStamp", "PhoneNumberConfirmed",
		       "TwoFactorEnabled", "LockoutEnabled", "AccessFailedCount", "LockoutEnd"
		FROM "AspNetUsers"
		WHERE "NormalizedEmail" = $1 OR "NormalizedUserName" = $1
		LIMIT 1;
	`

	var user models.ApplicationUser
	err := s.db.Pool.QueryRow(ctx, query, key).Scan(
		&user.ID, &user.Email, &user.UserName, &user.PasswordHash, &user.FirstName, &user.LastName,
		&user.CreatedAt, &user.LastLoginAt, &user.NormalizedEmail, &user.NormalizedUserName,
		&user.EmailConfirmed, &user.SecurityStamp, &user.ConcurrencyStamp, &user.PhoneNumberConfirmed,
		&user.TwoFactorEnabled, &user.LockoutEnabled, &user.AccessFailedCount, &user.LockoutEnd,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &models.AuthResponse{Success: false, Message: "Invalid credentials."}, nil
		}
		return nil, err
	}

	now := time.Now()
	if user.LockoutEnd != nil {
		if user.LockoutEnd.After(now) {
			return &models.AuthResponse{Success: false, Message: "Account is locked out. Please try again later."}, nil
		} else {
			user.LockoutEnd = nil
			user.AccessFailedCount = 0
		}
	}

	pwHash := ""
	if user.PasswordHash != nil {
		pwHash = *user.PasswordHash
	}

	if !s.password.Matches(req.Password, pwHash) {
		if user.LockoutEnabled {
			user.AccessFailedCount++
			if user.AccessFailedCount >= 5 {
				lockout := now.Add(5 * time.Minute)
				user.LockoutEnd = &lockout
			}
			_, _ = s.db.Pool.Exec(ctx,
				`UPDATE "AspNetUsers" SET "AccessFailedCount" = $1, "LockoutEnd" = $2 WHERE "Id" = $3;`,
				user.AccessFailedCount, user.LockoutEnd, user.ID,
			)
		}
		return &models.AuthResponse{Success: false, Message: "Invalid credentials."}, nil
	}

	// Login successful - reset lockout and update LastLoginAt
	user.AccessFailedCount = 0
	user.LockoutEnd = nil
	user.LastLoginAt = &now

	_, _ = s.db.Pool.Exec(ctx,
		`UPDATE "AspNetUsers" SET "AccessFailedCount" = 0, "LockoutEnd" = NULL, "LastLoginAt" = $1 WHERE "Id" = $2;`,
		now, user.ID,
	)

	token, exp, err := s.jwt.Generate(&user)
	if err != nil {
		return nil, err
	}

	return &models.AuthResponse{
		Success:    true,
		Message:    "Login successful.",
		Token:      &token,
		Expiration: &exp,
		User: &models.UserInfo{
			ID:        user.ID,
			Email:     user.Email,
			UserName:  user.UserName,
			FirstName: user.FirstName,
			LastName:  user.LastName,
		},
	}, nil
}

func ptr[T any](v T) *T {
	return &v
}
