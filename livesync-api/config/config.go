package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port               string
	DatabaseURL        string
	RedisURL           string
	JWTSecret          string
	JWTIssuer          string
	JWTAudience        string
	JWTExpirationHours int
	CorsAllowedOrigins []string
	Environment        string
}

func LoadConfig() *Config {
	port := getEnv("PORT", "8080")
	env := getEnv("ENVIRONMENT", "development")

	// PostgreSQL connection resolver
	dbURL := getEnv("LIVESYNC_DATABASE_URL", "")
	if dbURL == "" {
		dbURL = getEnv("DATABASE_URL", "")
	}
	if dbURL == "" {
		user := getEnv("LIVESYNC_POSTGRES_USERNAME", "devuser")
		pass := getEnv("LIVESYNC_POSTGRES_PASSWORD", "devpassword")
		host := getEnv("LIVESYNC_POSTGRES_HOST", "localhost")
		portStr := getEnv("LIVESYNC_POSTGRES_PORT", "5432")
		dbName := getEnv("LIVESYNC_POSTGRES_DB", "livesync")
		dbURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, portStr, dbName)
	} else if strings.HasPrefix(dbURL, "jdbc:postgresql://") {
		// Convert JDBC URL format jdbc:postgresql://host:port/db?opts to standard postgres://
		stripped := strings.TrimPrefix(dbURL, "jdbc:postgresql://")
		user := getEnv("LIVESYNC_POSTGRES_USERNAME", "devuser")
		pass := getEnv("LIVESYNC_POSTGRES_PASSWORD", "devpassword")

		// Strip query parameters for basic connection string
		parts := strings.SplitN(stripped, "?", 2)
		hostAndDb := parts[0]
		if user != "" && pass != "" {
			dbURL = fmt.Sprintf("postgres://%s:%s@%s?sslmode=disable", url.QueryEscape(user), url.QueryEscape(pass), hostAndDb)
		} else {
			dbURL = fmt.Sprintf("postgres://%s?sslmode=disable", hostAndDb)
		}
	}

	// Redis connection resolver
	redisURL := getEnv("LIVESYNC_REDIS_URL", "")
	if redisURL == "" {
		redisURL = getEnv("REDIS_URL", "")
	}
	if redisURL == "" {
		pass := getEnv("LIVESYNC_REDIS_PASSWORD", "LocalDevPassword123!")
		host := getEnv("LIVESYNC_REDIS_HOST", "localhost")
		rPort := getEnv("LIVESYNC_REDIS_PORT", "6379")
		if pass != "" {
			redisURL = fmt.Sprintf("redis://:%s@%s:%s/0", url.QueryEscape(pass), host, rPort)
		} else {
			redisURL = fmt.Sprintf("redis://%s:%s/0", host, rPort)
		}
	}

	jwtSecret := getEnv("LIVESYNC_JWT_SECRET", "LiveSync-Development-Only-Secret-Change-Me!")
	jwtIssuer := getEnv("LIVESYNC_JWT_ISSUER", "LiveSyncAuthAPI")
	jwtAudience := getEnv("LIVESYNC_JWT_AUDIENCE", "LiveSyncClient")

	expHoursStr := getEnv("LIVESYNC_JWT_EXPIRATION_HOURS", "24")
	expHours, err := strconv.Atoi(expHoursStr)
	if err != nil || expHours <= 0 {
		expHours = 24
	}

	corsOriginsStr := getEnv("LIVESYNC_CORS_ALLOWED_ORIGINS", "http://localhost:4200,http://localhost:4000,http://localhost:5038")
	var corsOrigins []string
	for _, origin := range strings.Split(corsOriginsStr, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			corsOrigins = append(corsOrigins, origin)
		}
	}

	return &Config{
		Port:               port,
		DatabaseURL:        dbURL,
		RedisURL:           redisURL,
		JWTSecret:          jwtSecret,
		JWTIssuer:          jwtIssuer,
		JWTAudience:        jwtAudience,
		JWTExpirationHours: expHours,
		CorsAllowedOrigins: corsOrigins,
		Environment:        env,
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}
