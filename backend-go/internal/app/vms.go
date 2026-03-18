package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func (a *App) registerVMRoutes(api chi.Router) {
	api.Get("/vms/", a.listVMs)
	api.Post("/vms/", a.createVM)
	api.Get("/vms/{id}/", a.getVM)
	api.Put("/vms/{id}/", a.updateVM)
	api.Patch("/vms/{id}/", a.updateVM)
	api.Delete("/vms/{id}/", a.deleteVM)
}

func (a *App) listVMs(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	page := parsePage(r)
	offset := (page - 1) * pageSize
	count, err := a.countByQuery(ctx, `SELECT COUNT(*) FROM inventory_vm`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	rows, err := a.DB.Query(ctx, `
		SELECT v.id, v.fqdn, v.ip, v.cpu, v.ram, v.disk, v.instance, v.tags, v.info_system_id,
		       i.name, COALESCE(i.code,''), v.ba_pfm_zak, v.ba_pfm_isp, v.ba_programma_byudzheta,
		       v.ba_finansovaya_pozitsiya, v.ba_mir_kod
		FROM inventory_vm v
		LEFT JOIN inventory_infosystem i ON i.id=v.info_system_id
		ORDER BY v.instance, v.fqdn
		LIMIT $1 OFFSET $2
	`, pageSize, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := make([]VM, 0)
	for rows.Next() {
		var item VM
		var tagsRaw []byte
		var infoSystemID *int64
		var infoSystemName *string
		var baProgram *string
		if err := rows.Scan(
			&item.ID, &item.FQDN, &item.IP, &item.CPU, &item.RAM, &item.Disk, &item.Instance, &tagsRaw, &infoSystemID,
			&infoSystemName, &item.InfoSystemCode, &item.BAPFMZak, &item.BAPFMIsp, &baProgram, &item.BAFinansovayaPozitsiya, &item.BAMirKod,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		item.Tags = toTags(tagsRaw)
		item.InfoSystem = infoSystemID
		item.InfoSystemName = infoSystemName
		item.BAProgrammaByudzheta = baProgram
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, paginatedResponse(r, count, page, out))
}

func (a *App) createVM(w http.ResponseWriter, r *http.Request) {
	type payload struct {
		FQDN                   string   `json:"fqdn"`
		IP                     string   `json:"ip"`
		CPU                    int      `json:"cpu"`
		RAM                    int      `json:"ram"`
		Disk                   int      `json:"disk"`
		Instance               int      `json:"instance"`
		Tags                   []string `json:"tags"`
		InfoSystem             *int64   `json:"info_system"`
		BAPFMZak               string   `json:"ba_pfm_zak"`
		BAPFMIsp               string   `json:"ba_pfm_isp"`
		BAProgrammaByudzheta   *string  `json:"ba_programma_byudzheta"`
		BAFinansovayaPozitsiya string   `json:"ba_finansovaya_pozitsiya"`
		BAMirKod               string   `json:"ba_mir_kod"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	id, err := a.upsertVM(ctx, 0, p, false)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	item, _ := a.fetchVMByID(ctx, id)
	writeJSON(w, http.StatusCreated, item)
}

func (a *App) getVM(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	item, err := a.fetchVMByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *App) updateVM(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	type payload struct {
		FQDN                   *string   `json:"fqdn"`
		IP                     *string   `json:"ip"`
		CPU                    *int      `json:"cpu"`
		RAM                    *int      `json:"ram"`
		Disk                   *int      `json:"disk"`
		Instance               *int      `json:"instance"`
		Tags                   []string  `json:"tags"`
		InfoSystem             *int64    `json:"info_system"`
		BAPFMZak               *string   `json:"ba_pfm_zak"`
		BAPFMIsp               *string   `json:"ba_pfm_isp"`
		BAProgrammaByudzheta   **string  `json:"ba_programma_byudzheta"`
		BAFinansovayaPozitsiya *string   `json:"ba_finansovaya_pozitsiya"`
		BAMirKod               *string   `json:"ba_mir_kod"`
	}
	var p payload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	cur, err := a.fetchVMByID(ctx, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	up := struct {
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
		FQDN:                   cur.FQDN,
		IP:                     cur.IP,
		CPU:                    cur.CPU,
		RAM:                    cur.RAM,
		Disk:                   cur.Disk,
		Instance:               cur.Instance,
		Tags:                   cur.Tags,
		InfoSystem:             cur.InfoSystem,
		BAPFMZak:               cur.BAPFMZak,
		BAPFMIsp:               cur.BAPFMIsp,
		BAProgrammaByudzheta:   cur.BAProgrammaByudzheta,
		BAFinansovayaPozitsiya: cur.BAFinansovayaPozitsiya,
		BAMirKod:               cur.BAMirKod,
	}
	if p.FQDN != nil {
		up.FQDN = *p.FQDN
	}
	if p.IP != nil {
		up.IP = *p.IP
	}
	if p.CPU != nil {
		up.CPU = *p.CPU
	}
	if p.RAM != nil {
		up.RAM = *p.RAM
	}
	if p.Disk != nil {
		up.Disk = *p.Disk
	}
	if p.Instance != nil {
		up.Instance = *p.Instance
	}
	if p.Tags != nil {
		up.Tags = p.Tags
	}
	if p.InfoSystem != nil {
		up.InfoSystem = p.InfoSystem
	}
	if p.BAPFMZak != nil {
		up.BAPFMZak = *p.BAPFMZak
	}
	if p.BAPFMIsp != nil {
		up.BAPFMIsp = *p.BAPFMIsp
	}
	if p.BAProgrammaByudzheta != nil {
		up.BAProgrammaByudzheta = *p.BAProgrammaByudzheta
	}
	if p.BAFinansovayaPozitsiya != nil {
		up.BAFinansovayaPozitsiya = *p.BAFinansovayaPozitsiya
	}
	if p.BAMirKod != nil {
		up.BAMirKod = *p.BAMirKod
	}
	id, err = a.upsertVM(ctx, id, struct {
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
	}(up), true)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	item, _ := a.fetchVMByID(ctx, id)
	writeJSON(w, http.StatusOK, item)
}

func (a *App) deleteVM(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
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

	// В существующей БД FK poolvm->vm не всегда с ON DELETE CASCADE.
	// Явно чистим связи с пулами перед удалением ВМ.
	if _, err = tx.Exec(ctx, `DELETE FROM inventory_poolvm WHERE vm_id=$1`, id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ct, err := tx.Exec(ctx, `DELETE FROM inventory_vm WHERE id=$1`, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	if ct.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not found."})
		return
	}
	if err = tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) upsertVM(ctx context.Context, id int64, p any, isUpdate bool) (int64, error) {
	// avoid generic reflection complexity: marshal/unmarshal map
	raw, _ := json.Marshal(p)
	var vmap map[string]any
	_ = json.Unmarshal(raw, &vmap)
	fqdn := stringsTrim(asString(vmap["FQDN"]), asString(vmap["fqdn"]))
	fqdn = strings.TrimSpace(fqdn)
	if fqdn == "" {
		return 0, errors.New("FQDN обязателен.")
	}
	ip := stringsTrim(asString(vmap["IP"]), asString(vmap["ip"]))
	if ip == "" {
		ip = "000.000.000.000"
	}
	if err := validateIP(ip); err != nil {
		return 0, err
	}
	cpu := pickInt(vmap["CPU"], vmap["cpu"], 1)
	ram := pickInt(vmap["RAM"], vmap["ram"], 1)
	disk := pickInt(vmap["Disk"], vmap["disk"], 10)
	instance := pickInt(vmap["Instance"], vmap["instance"], 1)
	if instance < 1 || instance > 20 {
		return 0, errors.New("Instance должен быть от 1 до 20.")
	}
	infoID := pickInt64Ptr(vmap["InfoSystem"], vmap["info_system"])
	var infoCode string
	if infoID != nil {
		_ = a.DB.QueryRow(ctx, `SELECT COALESCE(code,'') FROM inventory_infosystem WHERE id=$1`, *infoID).Scan(&infoCode)
	}
	tags := parseVMTags(extractTags(vmap))
	if len(tags) == 0 {
		tags = []string{"LINUX"}
	}
	if tags[0] != "LINUX" && tags[0] != "WINDOWS" && tags[0] != "MACOS" {
		return 0, errors.New("Первый тег должен быть LINUX, WINDOWS или MACOS.")
	}
	custom := []string{}
	if len(tags) > 2 {
		custom = tags[2:]
	}
	tags = buildTags(tags[0], infoCode, custom)

	baZak := stringsTrim(asString(vmap["BAPFMZak"]), asString(vmap["ba_pfm_zak"]))
	if baZak == "" {
		baZak = "Z000000"
	}
	baIsp := stringsTrim(asString(vmap["BAPFMIsp"]), asString(vmap["ba_pfm_isp"]))
	if baIsp == "" {
		baIsp = "Z000000"
	}
	baPos := stringsTrim(asString(vmap["BAFinansovayaPozitsiya"]), asString(vmap["ba_finansovaya_pozitsiya"]))
	if baPos == "" {
		baPos = "00.00.00.00"
	}
	baMir := stringsTrim(asString(vmap["BAMirKod"]), asString(vmap["ba_mir_kod"]))
	if baMir == "" {
		baMir = "ITI_000_0000"
	}
	var baProg *string
	if val, ok := vmap["BAProgrammaByudzheta"]; ok && val != nil {
		s := asString(val)
		baProg = &s
	}
	if val, ok := vmap["ba_programma_byudzheta"]; ok && val != nil {
		s := asString(val)
		baProg = &s
	}

	if !isUpdate {
		var newID int64
		err := a.DB.QueryRow(ctx, `
			INSERT INTO inventory_vm
			(fqdn, ip, cpu, ram, disk, instance, tags, info_system_id, ba_pfm_zak, ba_pfm_isp, ba_programma_byudzheta, ba_finansovaya_pozitsiya, ba_mir_kod)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			RETURNING id
		`, fqdn, ip, cpu, ram, disk, instance, toJSON(tags), infoID, baZak, baIsp, baProg, baPos, baMir).Scan(&newID)
		return newID, err
	}
	_, err := a.DB.Exec(ctx, `
		UPDATE inventory_vm
		SET fqdn=$2, ip=$3, cpu=$4, ram=$5, disk=$6, instance=$7, tags=$8, info_system_id=$9,
		    ba_pfm_zak=$10, ba_pfm_isp=$11, ba_programma_byudzheta=$12, ba_finansovaya_pozitsiya=$13, ba_mir_kod=$14
		WHERE id=$1
	`, id, fqdn, ip, cpu, ram, disk, instance, toJSON(tags), infoID, baZak, baIsp, baProg, baPos, baMir)
	return id, err
}

func (a *App) fetchVMByID(ctx context.Context, id int64) (VM, error) {
	var item VM
	var tagsRaw []byte
	var infoSystemID *int64
	var infoSystemName *string
	var baProgram *string
	err := a.DB.QueryRow(ctx, `
		SELECT v.id, v.fqdn, v.ip, v.cpu, v.ram, v.disk, v.instance, v.tags, v.info_system_id,
		       i.name, COALESCE(i.code,''), v.ba_pfm_zak, v.ba_pfm_isp, v.ba_programma_byudzheta,
		       v.ba_finansovaya_pozitsiya, v.ba_mir_kod
		FROM inventory_vm v
		LEFT JOIN inventory_infosystem i ON i.id=v.info_system_id
		WHERE v.id=$1
	`, id).Scan(
		&item.ID, &item.FQDN, &item.IP, &item.CPU, &item.RAM, &item.Disk, &item.Instance, &tagsRaw, &infoSystemID,
		&infoSystemName, &item.InfoSystemCode, &item.BAPFMZak, &item.BAPFMIsp, &baProgram, &item.BAFinansovayaPozitsiya, &item.BAMirKod,
	)
	item.Tags = toTags(tagsRaw)
	item.InfoSystem = infoSystemID
	item.InfoSystemName = infoSystemName
	item.BAProgrammaByudzheta = baProgram
	return item, err
}

func validateIP(ip string) error {
	pattern := regexp.MustCompile(`^(\d{1,3}\.){3}\d{1,3}$`)
	if !pattern.MatchString(ip) {
		return errors.New("Неверный формат IP адреса. Ожидается формат: xxx.xxx.xxx.xxx")
	}
	return nil
}

func stringsTrim(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

func pickInt(primary any, fallback any, d int) int {
	p := asInt(primary)
	if p != 0 {
		return p
	}
	f := asInt(fallback)
	if f != 0 {
		return f
	}
	return d
}

func pickInt64Ptr(primary any, fallback any) *int64 {
	if v := asInt64(primary); v > 0 {
		return &v
	}
	if v := asInt64(fallback); v > 0 {
		return &v
	}
	return nil
}

func extractTags(vmap map[string]any) []string {
	raw, ok := vmap["tags"]
	if !ok {
		raw = vmap["Tags"]
	}
	if raw == nil {
		return nil
	}
	switch t := raw.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			out = append(out, asString(item))
		}
		return out
	default:
		return nil
	}
}
