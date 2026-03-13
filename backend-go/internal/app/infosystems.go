package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

func (a *App) registerInfoSystemRoutes(api chi.Router) {
	api.Get("/info-systems/", a.listInfoSystems)
	api.Post("/info-systems/", a.createInfoSystem)
	api.Get("/info-systems/{id}/", a.getInfoSystem)
	api.Put("/info-systems/{id}/", a.updateInfoSystem)
	api.Patch("/info-systems/{id}/", a.updateInfoSystem)
	api.Delete("/info-systems/{id}/", a.deleteInfoSystem)
}

func (a *App) listInfoSystems(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	page := parsePage(r)
	offset := (page - 1) * pageSize
	streamFilter := r.URL.Query().Get("stream_id")

	var count int64
	var err error
	if streamFilter != "" {
		count, err = a.countByQuery(ctx, `SELECT COUNT(*) FROM inventory_infosystem WHERE stream_id=$1`, streamFilter)
	} else {
		count, err = a.countByQuery(ctx, `SELECT COUNT(*) FROM inventory_infosystem`)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	query := `
		SELECT i.id, i.name, i.code, i.is_id, i.stream_id, s.name, d.name
		FROM inventory_infosystem i
		JOIN inventory_stream s ON s.id=i.stream_id
		JOIN inventory_department d ON d.id=s.department_id
	`
	args := []any{}
	if streamFilter != "" {
		query += ` WHERE i.stream_id=$1`
		args = append(args, streamFilter)
	}
	query += ` ORDER BY i.name LIMIT $` + argPos(len(args)+1) + ` OFFSET $` + argPos(len(args)+2)
	args = append(args, pageSize, offset)

	rows, err := a.DB.Query(ctx, query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := make([]InfoSystem, 0)
	for rows.Next() {
		var item InfoSystem
		if err := rows.Scan(&item.ID, &item.Name, &item.Code, &item.IsID, &item.Stream, &item.StreamName, &item.DepartmentName); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, paginatedResponse(r, count, page, out))
}

func (a *App) createInfoSystem(w http.ResponseWriter, r *http.Request) {
	var raw any
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	if list, ok := raw.([]any); ok {
		a.bulkCreateInfoSystems(w, r, list)
		return
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid payload"})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	item, statusCode, err := a.createOrUpdateInfoSystemFromMap(ctx, obj)
	if err != nil {
		writeJSON(w, statusCode, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *App) bulkCreateInfoSystems(w http.ResponseWriter, r *http.Request, list []any) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	createdItems := make([]map[string]any, 0)
	errorsOut := make([]map[string]any, 0)
	for idx, itemRaw := range list {
		itemMap, ok := itemRaw.(map[string]any)
		if !ok {
			errorsOut = append(errorsOut, map[string]any{"index": idx, "error": "invalid item"})
			continue
		}
		result, _, err := a.createOrUpdateInfoSystemFromMap(ctx, itemMap)
		if err != nil {
			errorsOut = append(errorsOut, map[string]any{"index": idx, "error": err.Error()})
			continue
		}
		createdItems = append(createdItems, map[string]any{"id": result.ID, "name": result.Name, "created": true})
	}
	if len(errorsOut) > 0 {
		writeJSON(w, http.StatusMultiStatus, map[string]any{
			"created": len(createdItems),
			"errors":  errorsOut,
			"items":   createdItems,
		})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"created": len(createdItems), "items": createdItems})
}

func (a *App) createOrUpdateInfoSystemFromMap(ctx context.Context, in map[string]any) (InfoSystem, int, error) {
	var out InfoSystem
	name := strings.TrimSpace(asString(in["name"]))
	if name == "" {
		return out, http.StatusBadRequest, errors.New("Поле name обязательно")
	}
	streamID, err := a.resolveStreamID(ctx, in)
	if err != nil {
		return out, http.StatusBadRequest, err
	}
	code := strings.TrimSpace(asString(in["code"]))
	isID := strings.TrimSpace(asString(in["is_id"]))

	var existingID int64
	err = a.DB.QueryRow(ctx, `SELECT id FROM inventory_infosystem WHERE name=$1 AND stream_id=$2`, name, streamID).Scan(&existingID)
	if err == nil {
		_, err = a.DB.Exec(ctx, `UPDATE inventory_infosystem SET code=$2, is_id=$3 WHERE id=$1`, existingID, code, isID)
		if err != nil {
			return out, http.StatusBadRequest, err
		}
		out, err = a.fetchInfoSystemByID(ctx, existingID)
		return out, http.StatusOK, err
	}
	var id int64
	if err = a.DB.QueryRow(ctx, `INSERT INTO inventory_infosystem (name, code, is_id, stream_id) VALUES ($1,$2,$3,$4) RETURNING id`, name, code, isID, streamID).Scan(&id); err != nil {
		return out, http.StatusBadRequest, err
	}
	out, err = a.fetchInfoSystemByID(ctx, id)
	return out, http.StatusCreated, err
}

func (a *App) resolveStreamID(ctx context.Context, in map[string]any) (int64, error) {
	if val, ok := in["stream"]; ok {
		if id := asInt64(val); id > 0 {
			return id, nil
		}
	}
	streamName := strings.TrimSpace(asString(in["stream_name"]))
	departmentName := strings.TrimSpace(asString(in["department_name"]))
	if streamName != "" && departmentName != "" {
		deptID, err := a.getOrCreateDepartmentByName(ctx, departmentName)
		if err != nil {
			return 0, err
		}
		streamID, err := a.getOrCreateStreamByName(ctx, streamName, deptID)
		if err != nil {
			return 0, err
		}
		return streamID, nil
	}
	return 0, errors.New("Поле stream обязательно")
}

func (a *App) getInfoSystem(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	item, err := a.fetchInfoSystemByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *App) updateInfoSystem(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	type payload struct {
		Name   *string `json:"name"`
		Code   *string `json:"code"`
		IsID   *string `json:"is_id"`
		Stream *int64  `json:"stream"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	cur, err := a.fetchInfoSystemByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	if p.Name != nil {
		cur.Name = *p.Name
	}
	if p.Code != nil {
		cur.Code = *p.Code
	}
	if p.IsID != nil {
		cur.IsID = *p.IsID
	}
	if p.Stream != nil {
		cur.Stream = *p.Stream
	}
	_, err = a.DB.Exec(ctx, `UPDATE inventory_infosystem SET name=$2, code=$3, is_id=$4, stream_id=$5 WHERE id=$1`, id, cur.Name, cur.Code, cur.IsID, cur.Stream)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	item, _ := a.fetchInfoSystemByID(ctx, id)
	writeJSON(w, http.StatusOK, item)
}

func (a *App) deleteInfoSystem(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	ct, err := a.DB.Exec(ctx, `DELETE FROM inventory_infosystem WHERE id=$1`, id)
	if err != nil || ct.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) fetchInfoSystemByID(ctx context.Context, id int64) (InfoSystem, error) {
	var item InfoSystem
	err := a.DB.QueryRow(ctx, `
		SELECT i.id, i.name, i.code, i.is_id, i.stream_id, s.name, d.name
		FROM inventory_infosystem i
		JOIN inventory_stream s ON s.id=i.stream_id
		JOIN inventory_department d ON d.id=s.department_id
		WHERE i.id=$1
	`, id).Scan(&item.ID, &item.Name, &item.Code, &item.IsID, &item.Stream, &item.StreamName, &item.DepartmentName)
	return item, err
}
