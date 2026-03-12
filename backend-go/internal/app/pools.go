package app

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func (a *App) registerPoolRoutes(api chi.Router) {
	api.Get("/pools/", a.listPools)
	api.Post("/pools/", a.createPool)
	api.Get("/pools/{id}/", a.getPool)
	api.Put("/pools/{id}/", a.updatePool)
	api.Patch("/pools/{id}/", a.updatePool)
	api.Delete("/pools/{id}/", a.deletePool)
	api.Get("/pools/{id}/available_vms/", a.poolAvailableVMs)
	api.Post("/pools/{id}/add-vm/{vm_id}/", a.poolAddVM)
	api.Post("/pools/{id}/remove-vm/{vm_id}/", a.poolRemoveVM)
}

func (a *App) listPools(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	page := parsePage(r)
	offset := (page - 1) * pageSize
	count, err := a.countByQuery(ctx, `SELECT COUNT(*) FROM inventory_pool`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	rows, err := a.DB.Query(ctx, `SELECT id, name, created_at FROM inventory_pool ORDER BY created_at DESC LIMIT $1 OFFSET $2`, pageSize, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := make([]Pool, 0)
	for rows.Next() {
		var p Pool
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		p.PoolTags, _ = a.getPoolTags(ctx, p.ID)
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, paginatedResponse(r, count, page, out))
}

func (a *App) createPool(w http.ResponseWriter, r *http.Request) {
	type payload struct {
		Name string `json:"name"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	var id int64
	err := a.DB.QueryRow(ctx, `INSERT INTO inventory_pool (name, created_at) VALUES ($1, NOW()) RETURNING id`, p.Name).Scan(&id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	d, _ := a.fetchPoolDetail(ctx, id)
	writeJSON(w, http.StatusCreated, Pool{ID: d.ID, Name: d.Name, CreatedAt: d.CreatedAt, PoolTags: d.PoolTags})
}

func (a *App) getPool(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	d, err := a.fetchPoolDetail(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (a *App) updatePool(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	type payload struct {
		Name *string `json:"name"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	cur, err := a.fetchPoolDetail(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	if p.Name != nil {
		cur.Name = *p.Name
	}
	_, err = a.DB.Exec(ctx, `UPDATE inventory_pool SET name=$2 WHERE id=$1`, id, cur.Name)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	d, _ := a.fetchPoolDetail(ctx, id)
	writeJSON(w, http.StatusOK, Pool{ID: d.ID, Name: d.Name, CreatedAt: d.CreatedAt, PoolTags: d.PoolTags})
}

func (a *App) deletePool(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	ct, err := a.DB.Exec(ctx, `DELETE FROM inventory_pool WHERE id=$1`, id)
	if err != nil || ct.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) poolAvailableVMs(w http.ResponseWriter, r *http.Request) {
	poolID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	instanceVal, _ := a.poolInstanceValue(ctx, poolID)
	query := `
		SELECT v.id, v.fqdn, v.ip, v.cpu, v.ram, v.disk, v.instance, v.tags, v.info_system_id,
		       i.name, COALESCE(i.code,''), v.ba_pfm_zak, v.ba_pfm_isp, v.ba_programma_byudzheta,
		       v.ba_finansovaya_pozitsiya, v.ba_mir_kod
		FROM inventory_vm v
		LEFT JOIN inventory_infosystem i ON i.id=v.info_system_id
		WHERE v.id NOT IN (
			SELECT vm_id FROM inventory_poolvm WHERE pool_id=$1 AND removed_at IS NULL
		)
	`
	args := []any{poolID}
	if instanceVal != nil {
		query += ` AND v.instance=$2`
		args = append(args, *instanceVal)
	}
	query += ` ORDER BY v.instance, v.fqdn`
	rows, err := a.DB.Query(ctx, query, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := make([]VM, 0)
	for rows.Next() {
		var vm VM
		var tagsRaw []byte
		var infoSystemID *int64
		var infoSystemName *string
		var baProg *string
		if err := rows.Scan(
			&vm.ID, &vm.FQDN, &vm.IP, &vm.CPU, &vm.RAM, &vm.Disk, &vm.Instance, &tagsRaw, &infoSystemID,
			&infoSystemName, &vm.InfoSystemCode, &vm.BAPFMZak, &vm.BAPFMIsp, &baProg, &vm.BAFinansovayaPozitsiya, &vm.BAMirKod,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		vm.Tags = toTags(tagsRaw)
		vm.InfoSystem = infoSystemID
		vm.InfoSystemName = infoSystemName
		vm.BAProgrammaByudzheta = baProg
		out = append(out, vm)
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *App) poolAddVM(w http.ResponseWriter, r *http.Request) {
	poolID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "Pool не найден"})
		return
	}
	vmID, err := parseID(chi.URLParam(r, "vm_id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "VM не найдена"})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	vm, err := a.fetchVMByID(ctx, vmID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "VM не найдена"})
		return
	}
	instanceVal, _ := a.poolInstanceValue(ctx, poolID)
	if instanceVal != nil && vm.Instance != *instanceVal {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "В пул можно добавлять только ВМ с instance=" + strconv.Itoa(*instanceVal)})
		return
	}
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx)
	var pvID int64
	var removedAt *time.Time
	var originalTagsRaw []byte
	err = tx.QueryRow(ctx, `SELECT id, removed_at, original_tags FROM inventory_poolvm WHERE pool_id=$1 AND vm_id=$2`, poolID, vmID).Scan(&pvID, &removedAt, &originalTagsRaw)
	if err != nil {
		err = tx.QueryRow(ctx, `
			INSERT INTO inventory_poolvm (pool_id, vm_id, added_at, removed_at, original_tags)
			VALUES ($1,$2,NOW(),NULL,$3)
			RETURNING id
		`, poolID, vmID, toJSON(vm.Tags)).Scan(&pvID)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
	} else if removedAt != nil {
		_, _ = tx.Exec(ctx, `UPDATE inventory_poolvm SET removed_at=NULL WHERE id=$1`, pvID)
		if len(originalTagsRaw) > 0 {
			_, _ = tx.Exec(ctx, `UPDATE inventory_vm SET tags=$2 WHERE id=$1`, vmID, originalTagsRaw)
		}
	}
	if err := a.syncPoolTagsTx(ctx, tx, poolID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "pool_vm_id": pvID})
}

func (a *App) poolRemoveVM(w http.ResponseWriter, r *http.Request) {
	poolID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "ВМ не в пуле"})
		return
	}
	vmID, err := parseID(chi.URLParam(r, "vm_id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "ВМ не в пуле"})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx)
	var pvID int64
	var originalTagsRaw []byte
	err = tx.QueryRow(ctx, `SELECT id, original_tags FROM inventory_poolvm WHERE pool_id=$1 AND vm_id=$2 AND removed_at IS NULL`, poolID, vmID).Scan(&pvID, &originalTagsRaw)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "ВМ не в пуле"})
		return
	}
	if len(originalTagsRaw) > 0 {
		_, _ = tx.Exec(ctx, `UPDATE inventory_vm SET tags=$2 WHERE id=$1`, vmID, originalTagsRaw)
	}
	_, _ = tx.Exec(ctx, `UPDATE inventory_poolvm SET removed_at=NOW() WHERE id=$1`, pvID)
	_ = a.syncPoolTagsTx(ctx, tx, poolID)
	var other int64
	_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM inventory_poolvm WHERE vm_id=$1 AND removed_at IS NULL AND pool_id<>$2`, vmID, poolID).Scan(&other)
	if other == 0 {
		_, _ = tx.Exec(ctx, `UPDATE inventory_poolvm SET original_tags=NULL WHERE vm_id=$1`, vmID)
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (a *App) fetchPoolDetail(ctx context.Context, id int64) (PoolDetail, error) {
	var out PoolDetail
	err := a.DB.QueryRow(ctx, `SELECT id, name, created_at FROM inventory_pool WHERE id=$1`, id).Scan(&out.ID, &out.Name, &out.CreatedAt)
	if err != nil {
		return out, err
	}
	rows, err := a.DB.Query(ctx, `
		SELECT v.id, v.fqdn, v.instance
		FROM inventory_poolvm pv
		JOIN inventory_vm v ON v.id=pv.vm_id
		WHERE pv.pool_id=$1 AND pv.removed_at IS NULL
		ORDER BY v.fqdn
	`, id)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	out.VMsInPool = []PoolVMShort{}
	for rows.Next() {
		var vm PoolVMShort
		if err := rows.Scan(&vm.ID, &vm.FQDN, &vm.Instance); err != nil {
			return out, err
		}
		out.VMsInPool = append(out.VMsInPool, vm)
	}
	iv, _ := a.poolInstanceValue(ctx, id)
	out.InstanceVal = iv
	out.PoolTags, _ = a.getPoolTags(ctx, id)
	return out, nil
}

func (a *App) poolInstanceValue(ctx context.Context, poolID int64) (*int, error) {
	var instance int
	err := a.DB.QueryRow(ctx, `
		SELECT v.instance
		FROM inventory_poolvm pv
		JOIN inventory_vm v ON v.id=pv.vm_id
		WHERE pv.pool_id=$1 AND pv.removed_at IS NULL
		ORDER BY pv.id ASC LIMIT 1
	`, poolID).Scan(&instance)
	if err != nil {
		return nil, err
	}
	return &instance, nil
}

func (a *App) getPoolTags(ctx context.Context, poolID int64) ([]string, error) {
	var raw []byte
	err := a.DB.QueryRow(ctx, `
		SELECT v.tags
		FROM inventory_poolvm pv
		JOIN inventory_vm v ON v.id=pv.vm_id
		WHERE pv.pool_id=$1 AND pv.removed_at IS NULL
		ORDER BY pv.id LIMIT 1
	`, poolID).Scan(&raw)
	if err != nil {
		return []string{}, nil
	}
	return toTags(raw), nil
}

func (a *App) syncPoolTagsTx(ctx context.Context, tx pgx.Tx, poolID int64) error {
	rows, err := tx.Query(ctx, `
		SELECT v.id, v.tags, COALESCE(i.code,'')
		FROM inventory_poolvm pv
		JOIN inventory_vm v ON v.id=pv.vm_id
		LEFT JOIN inventory_infosystem i ON i.id=v.info_system_id
		WHERE pv.pool_id=$1 AND pv.removed_at IS NULL
	`, poolID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type vmRow struct {
		ID   int64
		Tags []string
		Code string
	}
	all := []vmRow{}
	tagSet := map[string]struct{}{}
	for rows.Next() {
		var id int64
		var raw []byte
		var code string
		if err := rows.Scan(&id, &raw, &code); err != nil {
			return err
		}
		tags := toTags(raw)
		all = append(all, vmRow{ID: id, Tags: tags, Code: normalizeTag(code)})
		for _, t := range tags {
			n := normalizeTag(t)
			if n != "" {
				tagSet[n] = struct{}{}
			}
		}
		if code != "" {
			tagSet[normalizeTag(code)] = struct{}{}
		}
	}
	if len(all) == 0 {
		return nil
	}
	result := []string{}
	for _, os := range []string{"LINUX", "WINDOWS", "MACOS"} {
		if _, ok := tagSet[os]; ok {
			result = append(result, os)
			delete(tagSet, os)
		}
	}
	rest := make([]string, 0, len(tagSet))
	for t := range tagSet {
		rest = append(rest, t)
	}
	sort.Strings(rest)
	result = append(result, rest...)
	for _, vm := range all {
		_, err := tx.Exec(ctx, `UPDATE inventory_vm SET tags=$2 WHERE id=$1`, vm.ID, toJSON(result))
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `
			UPDATE inventory_poolvm
			SET original_tags = COALESCE(original_tags, $2::jsonb)
			WHERE pool_id=$1 AND vm_id=$3
		`, poolID, toJSON(vm.Tags), vm.ID)
	}
	return nil
}
