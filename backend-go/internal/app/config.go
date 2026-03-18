package app

import (
	"fmt"
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		Port:        getenv("PORT", "8000"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}
	if cfg.DatabaseURL == "" {
		db := getenv("POSTGRES_DB", "vminventory")
		user := getenv("POSTGRES_USER", "vminventory")
		pass := getenv("POSTGRES_PASSWORD", "vminventory_secret")
		host := getenv("POSTGRES_HOST", "db")
		port := getenv("POSTGRES_PORT", "5432")
		cfg.DatabaseURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s", user, pass, host, port, db)
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
