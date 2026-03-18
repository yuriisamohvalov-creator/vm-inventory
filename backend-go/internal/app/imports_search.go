package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

func (a *App) registerImportRoutes(api chi.Router) {
	api.Post("/v1/departments/import", a.importDepartments)
	api.Post("/v1/streams/import", a.importStreams)
	api.Post("/v1/infosystems/import", a.importInfoSystems)
	api.Post("/v1/vm/import", a.importVMs)
	api.Post("/v1/pools/import", a.importPools)

	api.Post("/import/departments/", a.importDepartments)
	api.Post("/import/streams/", a.importStreams)
	api.Post("/import/info-systems/", a.importInfoSystems)
	api.Post("/import/vms/", a.importVMs)
	api.Post("/import/pools/", a.importPools)
}

func (a *App) registerSearchRoutes(api chi.Router) {
	api.Get("/v1/search", a.search)
	api.Get("/search/", a.search)
}

func decodeImportItems(r *http.Request) ([]map[string]any, error) {
	var raw any
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		return nil, err
	}
	if obj, ok := raw.(map[string]any); ok {
		if itemsRaw, ok := obj["items"]; ok {
			raw = itemsRaw
		}
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, errors.New("Ожидается JSON-массив")
	}
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out, nil
}

func (a *App) importDepartments(w http.ResponseWriter, r *http.Request) {
	items, err := decodeImportItems(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	created, updated := 0, 0
	ids := []int64{}
	for _, it := range items {
		name := strings.TrimSpace(asString(it["name"]))
		if name == "" {
			continue
		}
		var id int64
		err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_department WHERE name=$1`, name).Scan(&id)
		if err == nil {
			_, _ = a.DB.Exec(ctx, `
				UPDATE inventory_department
				SET short_name=$2, cpu_quota=$3, ram_quota=$4, disk_quota=$5
				WHERE id=$1
			`, id, asString(it["short_name"]), asInt(it["cpu_quota"]), asInt(it["ram_quota"]), asInt(it["disk_quota"]))
			updated++
		} else {
			_ = a.DB.QueryRow(ctx, `
				INSERT INTO inventory_department(name, short_name, cpu_quota, ram_quota, disk_quota)
				VALUES ($1,$2,$3,$4,$5) RETURNING id
			`, name, asString(it["short_name"]), asInt(it["cpu_quota"]), asInt(it["ram_quota"]), asInt(it["disk_quota"])).Scan(&id)
			created++
		}
		ids = append(ids, id)
	}
	writeJSON(w, http.StatusOK, map[string]any{"created": created, "updated": updated, "ids": ids})
}

func (a *App) importStreams(w http.ResponseWriter, r *http.Request) {
	items, err := decodeImportItems(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	created, updated := 0, 0
	ids := []int64{}
	for _, it := range items {
		name := strings.TrimSpace(asString(it["name"]))
		if name == "" {
			continue
		}
		deptID := asInt64(it["department_id"])
		if deptID == 0 {
			if d, ok := it["department"].(map[string]any); ok {
				var err error
				deptID, err = a.getOrCreateDepartmentByName(ctx, strings.TrimSpace(asString(d["name"])))
				if err != nil {
					continue
				}
			}
		}
		if deptID == 0 {
			continue
		}
		var id int64
		err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_stream WHERE name=$1 AND department_id=$2`, name, deptID).Scan(&id)
		if err == nil {
			_, _ = a.DB.Exec(ctx, `UPDATE inventory_stream SET cpu_quota=$2, ram_quota=$3, disk_quota=$4 WHERE id=$1`, id, asInt(it["cpu_quota"]), asInt(it["ram_quota"]), asInt(it["disk_quota"]))
			updated++
		} else {
			_ = a.DB.QueryRow(ctx, `
				INSERT INTO inventory_stream(name, department_id, cpu_quota, ram_quota, disk_quota)
				VALUES ($1,$2,$3,$4,$5) RETURNING id
			`, name, deptID, asInt(it["cpu_quota"]), asInt(it["ram_quota"]), asInt(it["disk_quota"])).Scan(&id)
			created++
		}
		ids = append(ids, id)
	}
	writeJSON(w, http.StatusOK, map[string]any{"created": created, "updated": updated, "ids": ids})
}

func (a *App) importInfoSystems(w http.ResponseWriter, r *http.Request) {
	items, err := decodeImportItems(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	created, updated := 0, 0
	ids := []int64{}
	for _, it := range items {
		name := strings.TrimSpace(asString(it["name"]))
		if name == "" {
			continue
		}
		streamID := asInt64(it["stream_id"])
		if streamID == 0 {
			if sd, ok := it["stream"].(map[string]any); ok {
				deptID := asInt64(sd["department_id"])
				if deptID == 0 {
					if dd, ok := sd["department"].(map[string]any); ok {
						deptID, _ = a.getOrCreateDepartmentByName(ctx, strings.TrimSpace(asString(dd["name"])))
					}
				}
				if deptID > 0 {
					streamID, _ = a.getOrCreateStreamByName(ctx, strings.TrimSpace(asString(sd["name"])), deptID)
				}
			}
		}
		if streamID == 0 {
			continue
		}
		id, err := a.getOrCreateInfoSystem(ctx, name, streamID, asString(it["code"]), asString(it["is_id"]))
		if err != nil {
			continue
		}
		ids = append(ids, id)
		if err == nil {
			created++
		} else {
			updated++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"created": created, "updated": updated, "ids": ids})
}

func (a *App) importVMs(w http.ResponseWriter, r *http.Request) {
	items, err := decodeImportItems(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	created, updated := 0, 0
	ids := []int64{}
	for _, it := range items {
		fqdn := strings.TrimSpace(asString(it["fqdn"]))
		if fqdn == "" {
			continue
		}
		infoID := asInt64(it["info_system_id"])
		if infoID == 0 {
			infoName := strings.TrimSpace(asString(it["info_system_name"]))
			streamID := asInt64(it["stream_id"])
			if infoName != "" && streamID > 0 {
				infoID, _ = a.getOrCreateInfoSystem(ctx, infoName, streamID, asString(it["code"]), asString(it["is_id"]))
			}
		}
		payload := struct {
			FQDN                   string
			IP                     string
			CPU                    int
			RAM                    int
			Disk                   int
			Instance               int
			Tags                   []string
			InfoSystem             *int64
			BAPFMZak               string
			BAPFMIsp               string
			BAProgrammaByudzheta   *string
			BAFinansovayaPozitsiya string
			BAMirKod               string
		}{
			FQDN:     fqdn,
			IP:       strings.TrimSpace(asString(it["ip"])),
			CPU:      asInt(it["cpu"]),
			RAM:      asInt(it["ram"]),
			Disk:     asInt(it["disk"]),
			Instance: asInt(it["instance"]),
			Tags:     extractTagsFromMap(it),
			InfoSystem: func() *int64 {
				if infoID > 0 {
					return &infoID
				}
				return nil
			}(),
			BAPFMZak:               asString(it["ba_pfm_zak"]),
			BAPFMIsp:               asString(it["ba_pfm_isp"]),
			BAProgrammaByudzheta:   ptrOrNil(asString(it["ba_programma_byudzheta"])),
			BAFinansovayaPozitsiya: asString(it["ba_finansovaya_pozitsiya"]),
			BAMirKod:               asString(it["ba_mir_kod"]),
		}
		var existingID int64
		err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_vm WHERE fqdn=$1`, fqdn).Scan(&existingID)
		if err == nil {
			if _, err := a.upsertVM(ctx, existingID, payload, true); err == nil {
				updated++
				ids = append(ids, existingID)
			}
		} else {
			if id, err := a.upsertVM(ctx, 0, payload, false); err == nil {
				created++
				ids = append(ids, id)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"created": created, "updated": updated, "ids": ids})
}

func (a *App) importPools(w http.ResponseWriter, r *http.Request) {
	items, err := decodeImportItems(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	created, updated := 0, 0
	ids := []int64{}
	for _, it := range items {
		name := strings.TrimSpace(asString(it["name"]))
		if name == "" {
			continue
		}
		var poolID int64
		err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_pool WHERE name=$1`, name).Scan(&poolID)
		if err == nil {
			updated++
		} else {
			_ = a.DB.QueryRow(ctx, `INSERT INTO inventory_pool(name, created_at) VALUES ($1,NOW()) RETURNING id`, name).Scan(&poolID)
			created++
		}
		ids = append(ids, poolID)
		fqdns := toStringArray(it["vm_fqdns"])
		if len(fqdns) == 0 {
			fqdns = toStringArray(it["vms"])
		}
		for _, fqdn := range fqdns {
			var vmID int64
			if err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_vm WHERE fqdn=$1`, fqdn).Scan(&vmID); err == nil {
				_, _ = a.DB.Exec(ctx, `
					INSERT INTO inventory_poolvm(pool_id, vm_id, added_at, removed_at, original_tags)
					VALUES ($1,$2,NOW(),NULL,NULL)
					ON CONFLICT (pool_id, vm_id) DO UPDATE SET removed_at=NULL
				`, poolID, vmID)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"created": created, "updated": updated, "ids": ids})
}

func (a *App) search(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	section := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("section")))
	out := map[string]any{
		"departments":  []Department{},
		"streams":      []Stream{},
		"info_systems": []InfoSystem{},
		"vms":          []VM{},
		"pools":        []Pool{},
	}
	if q == "" {
		writeJSON(w, http.StatusOK, out)
		return
	}
	if section == "" || section == "departments" {
		rows, _ := a.DB.Query(ctx, `
			SELECT id, name, short_name, cpu_quota, ram_quota, disk_quota
			FROM inventory_department
			WHERE name ILIKE $1 OR short_name ILIKE $1
			ORDER BY name LIMIT 50
		`, "%"+q+"%")
		depts := []Department{}
		for rows.Next() {
			var d Department
			_ = rows.Scan(&d.ID, &d.Name, &d.ShortName, &d.CPUQuota, &d.RAMQuota, &d.DiskQuota)
			depts = append(depts, d)
		}
		rows.Close()
		out["departments"] = depts
	}
	if section == "" || section == "streams" {
		rows, _ := a.DB.Query(ctx, `
			SELECT s.id, s.name, s.department_id, d.name, s.cpu_quota, s.ram_quota, s.disk_quota
			FROM inventory_stream s
			JOIN inventory_department d ON d.id=s.department_id
			WHERE s.name ILIKE $1
			ORDER BY s.name LIMIT 50
		`, "%"+q+"%")
		streams := []Stream{}
		for rows.Next() {
			var s Stream
			_ = rows.Scan(&s.ID, &s.Name, &s.Department, &s.DepartmentName, &s.CPUQuota, &s.RAMQuota, &s.DiskQuota)
			streams = append(streams, s)
		}
		rows.Close()
		out["streams"] = streams
	}
	if section == "" || section == "infosystems" {
		rows, _ := a.DB.Query(ctx, `
			SELECT i.id, i.name, i.code, i.is_id, i.stream_id, s.name, d.name
			FROM inventory_infosystem i
			JOIN inventory_stream s ON s.id=i.stream_id
			JOIN inventory_department d ON d.id=s.department_id
			WHERE i.name ILIKE $1 OR i.code ILIKE $1 OR i.is_id ILIKE $1
			ORDER BY i.name LIMIT 50
		`, "%"+q+"%")
		is := []InfoSystem{}
		for rows.Next() {
			var i InfoSystem
			_ = rows.Scan(&i.ID, &i.Name, &i.Code, &i.IsID, &i.Stream, &i.StreamName, &i.DepartmentName)
			is = append(is, i)
		}
		rows.Close()
		out["info_systems"] = is
	}
	if section == "" || section == "vms" {
		rows, _ := a.DB.Query(ctx, `
			SELECT v.id, v.fqdn, v.ip, v.cpu, v.ram, v.disk, v.instance, v.tags, v.info_system_id,
			       i.name, COALESCE(i.code,''), v.ba_pfm_zak, v.ba_pfm_isp, v.ba_programma_byudzheta, v.ba_finansovaya_pozitsiya, v.ba_mir_kod
			FROM inventory_vm v
			LEFT JOIN inventory_infosystem i ON i.id=v.info_system_id
			WHERE v.fqdn ILIKE $1 OR v.ip ILIKE $1 OR CAST(v.tags AS text) ILIKE $1
			ORDER BY v.fqdn LIMIT 50
		`, "%"+q+"%")
		vms := []VM{}
		for rows.Next() {
			var vm VM
			var tagsRaw []byte
			var infoID *int64
			var infoName *string
			var baProg *string
			_ = rows.Scan(&vm.ID, &vm.FQDN, &vm.IP, &vm.CPU, &vm.RAM, &vm.Disk, &vm.Instance, &tagsRaw, &infoID, &infoName, &vm.InfoSystemCode, &vm.BAPFMZak, &vm.BAPFMIsp, &baProg, &vm.BAFinansovayaPozitsiya, &vm.BAMirKod)
			vm.Tags = toTags(tagsRaw)
			vm.InfoSystem = infoID
			vm.InfoSystemName = infoName
			vm.BAProgrammaByudzheta = baProg
			vms = append(vms, vm)
		}
		rows.Close()
		out["vms"] = vms
	}
	if section == "" || section == "pools" {
		rows, _ := a.DB.Query(ctx, `SELECT id, name, created_at FROM inventory_pool WHERE name ILIKE $1 ORDER BY created_at DESC LIMIT 50`, "%"+q+"%")
		pools := []Pool{}
		for rows.Next() {
			var p Pool
			_ = rows.Scan(&p.ID, &p.Name, &p.CreatedAt)
			p.PoolTags, _ = a.getPoolTags(ctx, p.ID)
			pools = append(pools, p)
		}
		rows.Close()
		out["pools"] = pools
	}
	writeJSON(w, http.StatusOK, out)
}

func ptrOrNil(v string) *string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return &v
}

func toStringArray(v any) []string {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, x := range t {
			s := strings.TrimSpace(asString(x))
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func extractTagsFromMap(m map[string]any) []string {
	if raw, ok := m["tags"]; ok {
		return toStringArray(raw)
	}
	return nil
}

var _ = context.Background
