package app

import (
	"context"
	"strconv"
)

func argPos(i int) string {
	return strconv.Itoa(i)
}

func (a *App) countByQuery(ctx context.Context, query string, args ...any) (int64, error) {
	var c int64
	err := a.DB.QueryRow(ctx, query, args...).Scan(&c)
	return c, err
}
