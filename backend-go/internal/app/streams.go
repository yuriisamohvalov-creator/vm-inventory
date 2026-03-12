package app

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (a *App) registerStreamRoutes(api chi.Router) {
	api.Get("/streams/", a.listStreams)
	api.Post("/streams/", a.createStream)
	api.Get("/streams/{id}/", a.getStream)
	api.Put("/streams/{id}/", a.updateStream)
	api.Patch("/streams/{id}/", a.updateStream)
	api.Delete("/streams/{id}/", a.deleteStream)
}

func (a *App) listStreams(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	page := parsePage(r)
	offset := (page - 1) * pageSize
	deptFilter := r.URL.Query().Get("department_id")

	var count int64
	var err error
	if deptFilter != "" {
		count, err = a.countByQuery(ctx, `SELECT COUNT(*) FROM inventory_stream WHERE department_id=$1`, deptFilter)
	} else {
		count, err = a.countByQuery(ctx, `SELECT COUNT(*) FROM inventory_stream`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	query := `
		SELECT s.id, s.name, s.department_id, d.name, s.cpu_quota, s.ram_quota, s.disk_quota
		FROM inventory_stream s
		JOIN inventory_department d ON d.id=s.department_id
	`
	args := []any{}
	if deptFilter != "" {
		query += ` WHERE s.department_id=$1`
		args = append(args, deptFilter)
	}
	query += ` ORDER BY s.name LIMIT $` + argPos(len(args)+1) + ` OFFSET $` + argPos(len(args)+2)
	args = append(args, pageSize, offset)

	rows, err := a.DB.Query(ctx, query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()

	out := make([]Stream, 0)
	for rows.Next() {
		var s Stream
		if err := rows.Scan(&s.ID, &s.Name, &s.Department, &s.DepartmentName, &s.CPUQuota, &s.RAMQuota, &s.DiskQuota); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, paginatedResponse(r, count, page, out))
}

func (a *App) createStream(w http.ResponseWriter, r *http.Request) {
	type payload struct {
		Name       string `json:"name"`
		Department int64  `json:"department"`
		CPUQuota   int    `json:"cpu_quota"`
		RAMQuota   int    `json:"ram_quota"`
		DiskQuota  int    `json:"disk_quota"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	var id int64
	err := a.DB.QueryRow(ctx, `
		INSERT INTO inventory_stream (name, department_id, cpu_quota, ram_quota, disk_quota)
		VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, p.Name, p.Department, p.CPUQuota, p.RAMQuota, p.DiskQuota).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	s, err := a.fetchStreamByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, s)
}

func (a *App) getStream(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	s, err := a.fetchStreamByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (a *App) updateStream(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	type payload struct {
		Name       *string `json:"name"`
		Department *int64  `json:"department"`
		CPUQuota   *int    `json:"cpu_quota"`
		RAMQuota   *int    `json:"ram_quota"`
		DiskQuota  *int    `json:"disk_quota"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	cur, err := a.fetchStreamByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	if p.Name != nil {
		cur.Name = *p.Name
	}
	if p.Department != nil {
		cur.Department = *p.Department
	}
	if p.CPUQuota != nil {
		cur.CPUQuota = *p.CPUQuota
	}
	if p.RAMQuota != nil {
		cur.RAMQuota = *p.RAMQuota
	}
	if p.DiskQuota != nil {
		cur.DiskQuota = *p.DiskQuota
	}
	_, err = a.DB.Exec(ctx, `
		UPDATE inventory_stream
		SET name=$2, department_id=$3, cpu_quota=$4, ram_quota=$5, disk_quota=$6
		WHERE id=$1
	`, id, cur.Name, cur.Department, cur.CPUQuota, cur.RAMQuota, cur.DiskQuota)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	s, _ := a.fetchStreamByID(ctx, id)
	writeJSON(w, http.StatusOK, s)
}

func (a *App) deleteStream(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	ct, err := a.DB.Exec(ctx, `DELETE FROM inventory_stream WHERE id=$1`, id)
	if err != nil || ct.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) fetchStreamByID(ctx context.Context, id int64) (Stream, error) {
	var s Stream
	err := a.DB.QueryRow(ctx, `
		SELECT s.id, s.name, s.department_id, d.name, s.cpu_quota, s.ram_quota, s.disk_quota
		FROM inventory_stream s
		JOIN inventory_department d ON d.id=s.department_id
		WHERE s.id=$1
	`, id).Scan(&s.ID, &s.Name, &s.Department, &s.DepartmentName, &s.CPUQuota, &s.RAMQuota, &s.DiskQuota)
	return s, err
}
