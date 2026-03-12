package app

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (a *App) registerDepartmentRoutes(api chi.Router) {
	api.Get("/departments/", a.listDepartments)
	api.Post("/departments/", a.createDepartment)
	api.Get("/departments/{id}/", a.getDepartment)
	api.Put("/departments/{id}/", a.updateDepartment)
	api.Patch("/departments/{id}/", a.updateDepartment)
	api.Delete("/departments/{id}/", a.deleteDepartment)
}

func (a *App) listDepartments(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	page := parsePage(r)
	offset := (page - 1) * pageSize

	var count int64
	if err := a.DB.QueryRow(ctx, `SELECT COUNT(*) FROM inventory_department`).Scan(&count); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	rows, err := a.DB.Query(ctx, `
		SELECT d.id, d.name, d.short_name, d.cpu_quota, d.ram_quota, d.disk_quota,
		       COALESCE(SUM(s.cpu_quota), 0) AS streams_cpu_quota_sum,
		       COALESCE(SUM(s.ram_quota), 0) AS streams_ram_quota_sum,
		       COALESCE(SUM(s.disk_quota), 0) AS streams_disk_quota_sum
		FROM inventory_department d
		LEFT JOIN inventory_stream s ON s.department_id = d.id
		GROUP BY d.id
		ORDER BY d.name
		LIMIT $1 OFFSET $2
	`, pageSize, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()

	results := make([]Department, 0)
	for rows.Next() {
		var item Department
		if err := rows.Scan(
			&item.ID, &item.Name, &item.ShortName, &item.CPUQuota, &item.RAMQuota, &item.DiskQuota,
			&item.StreamsCPUQuotaSum, &item.StreamsRAMQuotaSum, &item.StreamsDiskQuotaSum,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		item.QuotaExceeded = item.StreamsCPUQuotaSum > item.CPUQuota || item.StreamsRAMQuotaSum > item.RAMQuota || item.StreamsDiskQuotaSum > item.DiskQuota
		results = append(results, item)
	}
	writeJSON(w, http.StatusOK, paginatedResponse(r, count, page, results))
}

func (a *App) createDepartment(w http.ResponseWriter, r *http.Request) {
	type payload struct {
		Name      string `json:"name"`
		ShortName string `json:"short_name"`
		CPUQuota  int    `json:"cpu_quota"`
		RAMQuota  int    `json:"ram_quota"`
		DiskQuota int    `json:"disk_quota"`
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
		INSERT INTO inventory_department (name, short_name, cpu_quota, ram_quota, disk_quota)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, p.Name, p.ShortName, p.CPUQuota, p.RAMQuota, p.DiskQuota).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	dept, err := a.fetchDepartmentByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, dept)
}

func (a *App) getDepartment(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	dept, err := a.fetchDepartmentByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	writeJSON(w, http.StatusOK, dept)
}

func (a *App) updateDepartment(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	type payload struct {
		Name      *string `json:"name"`
		ShortName *string `json:"short_name"`
		CPUQuota  *int    `json:"cpu_quota"`
		RAMQuota  *int    `json:"ram_quota"`
		DiskQuota *int    `json:"disk_quota"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()

	curr, err := a.fetchDepartmentByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	if p.Name != nil {
		curr.Name = *p.Name
	}
	if p.ShortName != nil {
		curr.ShortName = *p.ShortName
	}
	if p.CPUQuota != nil {
		curr.CPUQuota = *p.CPUQuota
	}
	if p.RAMQuota != nil {
		curr.RAMQuota = *p.RAMQuota
	}
	if p.DiskQuota != nil {
		curr.DiskQuota = *p.DiskQuota
	}

	_, err = a.DB.Exec(ctx, `
		UPDATE inventory_department
		SET name=$2, short_name=$3, cpu_quota=$4, ram_quota=$5, disk_quota=$6
		WHERE id=$1
	`, id, curr.Name, curr.ShortName, curr.CPUQuota, curr.RAMQuota, curr.DiskQuota)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	dept, _ := a.fetchDepartmentByID(ctx, id)
	writeJSON(w, http.StatusOK, dept)
}

func (a *App) deleteDepartment(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	ct, err := a.DB.Exec(ctx, `DELETE FROM inventory_department WHERE id=$1`, id)
	if err != nil || ct.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) fetchDepartmentByID(ctx context.Context, id int64) (Department, error) {
	var item Department
	err := a.DB.QueryRow(ctx, `
		SELECT d.id, d.name, d.short_name, d.cpu_quota, d.ram_quota, d.disk_quota,
		       COALESCE(SUM(s.cpu_quota), 0), COALESCE(SUM(s.ram_quota), 0), COALESCE(SUM(s.disk_quota), 0)
		FROM inventory_department d
		LEFT JOIN inventory_stream s ON s.department_id = d.id
		WHERE d.id = $1
		GROUP BY d.id
	`, id).Scan(
		&item.ID, &item.Name, &item.ShortName, &item.CPUQuota, &item.RAMQuota, &item.DiskQuota,
		&item.StreamsCPUQuotaSum, &item.StreamsRAMQuotaSum, &item.StreamsDiskQuotaSum,
	)
	if err != nil {
		return item, err
	}
	item.QuotaExceeded = item.StreamsCPUQuotaSum > item.CPUQuota || item.StreamsRAMQuotaSum > item.RAMQuota || item.StreamsDiskQuotaSum > item.DiskQuota
	return item, nil
}
