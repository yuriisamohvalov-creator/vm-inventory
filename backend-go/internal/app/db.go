package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

type App struct {
	DB  *pgxpool.Pool
	Cfg Config
}

func NewApp(ctx context.Context, cfg Config) (*App, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	poolCfg.MaxConns = 15
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("connect db: %w", err)
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return &App{DB: pool, Cfg: cfg}, nil
}

func (a *App) Close() {
	if a.DB != nil {
		a.DB.Close()
	}
}

func (a *App) RunMigrations(ctx context.Context, migrationDir string, databaseURL string) error {
	goose.SetBaseFS(nil)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	sqlDB, err := goose.OpenDBWithDriver("pgx", databaseURL)
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	if err := goose.UpContext(ctx, sqlDB, migrationDir); err != nil {
		if strings.Contains(err.Error(), "no next version found") {
			return nil
		}
		return err
	}
	return nil
}

func toTags(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var tags []string
	if err := json.Unmarshal(raw, &tags); err != nil {
		return []string{}
	}
	return tags
}

func toJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("[]")
	}
	return b
}

func normalizeTag(t string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(t), " ", "_"))
}

func buildTags(osTag, infoSystemCode string, custom []string) []string {
	first := normalizeTag(osTag)
	if first == "" {
		first = "LINUX"
	}
	if first != "LINUX" && first != "WINDOWS" && first != "MACOS" {
		first = "LINUX"
	}
	tags := []string{first}
	tags = append(tags, normalizeTag(infoSystemCode))
	for _, t := range custom {
		n := normalizeTag(t)
		if n == "" {
			continue
		}
		exists := false
		for _, existing := range tags {
			if existing == n {
				exists = true
				break
			}
		}
		if !exists {
			tags = append(tags, n)
		}
	}
	return tags
}

func parseVMTags(raw []string) []string {
	if len(raw) == 0 {
		return []string{"LINUX"}
	}
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		n := normalizeTag(t)
		if n != "" {
			out = append(out, n)
		}
	}
	if len(out) == 0 {
		out = []string{"LINUX"}
	}
	return out
}

func ptrString(v string) *string { return &v }
func ptrInt64(v int64) *int64    { return &v }
func ptrInt(v int) *int          { return &v }

func withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 10*time.Second)
}

var errBadInput = errors.New("bad input")
