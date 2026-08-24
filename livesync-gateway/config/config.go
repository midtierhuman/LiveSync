package config

import (
	"os"
	"strings"
)

type Config struct {
	Port               string
	APIBaseURL         string
	AIGRPCURL          string
	LocalLLMURL        string
	LocalLLMModel      string
	JWTSecret          string
	JWTIssuer          string
	JWTAudience        string
	CORSAllowedOrigins []string
}

func LoadConfig() *Config {
	port := getEnv("PORT", "8081")
	apiURL := getEnv("LIVESYNC_API_BASE_URL", getEnv("API_BASE_URL", "http://127.0.0.1:8080"))
	aiGRPCURL := getEnv("LIVESYNC_AI_GRPC_URL", "127.0.0.1:50051")
	localLLMURL := getEnv("LOCAL_LLM_URL", "http://127.0.0.1:8080")
	localLLMModel := getEnv("LOCAL_LLM_MODEL", "Qwen2.5-Coder-14B-Instruct-Q4_K_M")
	jwtSecret := getEnv("LIVESYNC_JWT_SECRET", "LiveSync-Development-Only-Secret-Change-Me!")
	jwtIssuer := getEnv("LIVESYNC_JWT_ISSUER", getEnv("JWT_ISSUER", "LiveSyncAuthAPI"))
	jwtAudience := getEnv("LIVESYNC_JWT_AUDIENCE", getEnv("JWT_AUDIENCE", "LiveSyncClient"))

	corsStr := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:4200,http://localhost:4000,http://localhost:5038")
	origins := parseCORS(corsStr)

	return &Config{
		Port:               port,
		APIBaseURL:         strings.TrimRight(apiURL, "/"),
		AIGRPCURL:          aiGRPCURL,
		LocalLLMURL:        strings.TrimRight(localLLMURL, "/"),
		LocalLLMModel:      localLLMModel,
		JWTSecret:          jwtSecret,
		JWTIssuer:          jwtIssuer,
		JWTAudience:        jwtAudience,
		CORSAllowedOrigins: origins,
	}
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}

func parseCORS(corsStr string) []string {
	corsStr = strings.TrimSpace(corsStr)
	if strings.HasPrefix(corsStr, "[") && strings.HasSuffix(corsStr, "]") {
		corsStr = corsStr[1 : len(corsStr)-1]
	}
	parts := strings.Split(corsStr, ",")
	var result []string
	for _, p := range parts {
		cleaned := strings.Trim(strings.TrimSpace(p), `"`)
		if cleaned != "" {
			result = append(result, cleaned)
		}
	}
	return result
}
