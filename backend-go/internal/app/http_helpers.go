package app

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
)

const pageSize = 100

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func parseID(idRaw string) (int64, error) {
	return strconv.ParseInt(idRaw, 10, 64)
}

func parsePage(r *http.Request) int {
	pRaw := r.URL.Query().Get("page")
	if pRaw == "" {
		return 1
	}
	p, err := strconv.Atoi(pRaw)
	if err != nil || p < 1 {
		return 1
	}
	return p
}

func paginatedResponse[T any](r *http.Request, count int64, page int, results []T) map[string]any {
	base := *r.URL
	q := base.Query()
	offset := (page - 1) * pageSize
	prevPage := page - 1
	nextPage := page + 1
	var nextURL any
	var prevURL any
	if int64(offset+len(results)) < count {
		nextURL = buildPageURL(base.Path, q, nextPage)
	} else {
		nextURL = nil
	}
	if page > 1 {
		prevURL = buildPageURL(base.Path, q, prevPage)
	} else {
		prevURL = nil
	}
	return map[string]any{
		"count":    count,
		"next":     nextURL,
		"previous": prevURL,
		"results":  results,
	}
}

func buildPageURL(path string, q url.Values, page int) string {
	qc := url.Values{}
	for k, vv := range q {
		for _, v := range vv {
			qc.Add(k, v)
		}
	}
	qc.Set("page", strconv.Itoa(page))
	return path + "?" + qc.Encode()
}
