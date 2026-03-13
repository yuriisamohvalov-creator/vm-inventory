package app

import (
	"fmt"
	"os"
)

type Config struct {
	Port                string
	DatabaseURL         string
	AuthTokenTTLMinutes int
	BootstrapUsername   string
	BootstrapPassword   string
	BootstrapRole       string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		Port:                getenv("PORT", "8000"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		AuthTokenTTLMinutes: getenvInt("AUTH_TOKEN_TTL_MINUTES", 480),
		BootstrapUsername:   getenv("AUTH_BOOTSTRAP_USERNAME", "admin"),
		BootstrapPassword:   getenv("AUTH_BOOTSTRAP_PASSWORD", "P@ssw0rD"),
		BootstrapRole:       getenv("AUTH_BOOTSTRAP_ROLE", "admin"),
	}
	if cfg.DatabaseURL == "" {
		db := getenv("POSTGRES_DB", "vminventory")
		user := getenv("POSTGRES_USER", "vminventory")
		pass := getenv("POSTGRES_PASSWORD", "vminventory_secret")
		host := getenv("POSTGRES_HOST", "db")
		port := getenv("POSTGRES_PORT", "5432")
		cfg.DatabaseURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s", user, pass, host, port, db)
	}
	if cfg.AuthTokenTTLMinutes <= 0 {
		cfg.AuthTokenTTLMinutes = 480
	}
	if cfg.BootstrapRole != "admin" && cfg.BootstrapRole != "analyst" {
		cfg.BootstrapRole = "admin"
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func getenvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	var out int
	_, err := fmt.Sscanf(v, "%d", &out)
	if err != nil {
		return fallback
	}
	return out
}
