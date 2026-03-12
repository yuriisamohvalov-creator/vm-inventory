package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (a *App) registerReportRoutes(api chi.Router) {
	api.Get("/report/", a.reportList)
	api.Get("/report/pdf/", a.reportPDF)
	api.Get("/report/export/", a.reportPDF)
	api.Get("/report/export/json/", a.reportJSON)
	api.Get("/report/export/xlsx/", a.reportXLSX)
	api.Get("/v1/report/json", a.reportJSON)
	api.Get("/v1/report/xlsx", a.reportXLSX)
}

func (a *App) reportList(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	data, err := a.buildReportData(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (a *App) reportJSON(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	data, err := a.buildReportData(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	body, _ := json.MarshalIndent(data, "", "  ")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="vm-inventory-report.json"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (a *App) reportPDF(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	data, err := a.buildReportData(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	pdfData, err := BuildPDFReport(data)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="vm-inventory-report.pdf"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdfData)
}

func (a *App) reportXLSX(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := withTimeout(r.Context())
	defer cancel()
	data, err := a.buildReportData(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	xlsxData, err := BuildXLSXReport(data)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="vm-inventory-report.xlsx"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(xlsxData)
}

func (a *App) buildReportData(ctx context.Context) ([]ReportDepartment, error) {
	deptRows, err := a.DB.Query(ctx, `
		SELECT id, name, short_name, cpu_quota, ram_quota, disk_quota
		FROM inventory_department
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer deptRows.Close()
	result := []ReportDepartment{}
	for deptRows.Next() {
		var deptID int64
		dept := ReportDepartment{}
		if err := deptRows.Scan(&deptID, &dept.Name, &dept.ShortName, &dept.CPUQuota, &dept.RAMQuota, &dept.DiskQuota); err != nil {
			return nil, err
		}
		dept.ID = &deptID
		streamRows, err := a.DB.Query(ctx, `
			SELECT id, name, cpu_quota, ram_quota, disk_quota
			FROM inventory_stream
			WHERE department_id=$1
			ORDER BY name
		`, deptID)
		if err != nil {
			return nil, err
		}
		streams := []ReportStream{}
		for streamRows.Next() {
			var streamID int64
			stream := ReportStream{}
			if err := streamRows.Scan(&streamID, &stream.Name, &stream.CPUQuota, &stream.RAMQuota, &stream.DiskQuota); err != nil {
				streamRows.Close()
				return nil, err
			}
			stream.ID = &streamID
			isRows, err := a.DB.Query(ctx, `
				SELECT id, name, code, is_id
				FROM inventory_infosystem
				WHERE stream_id=$1
				ORDER BY name
			`, streamID)
			if err != nil {
				streamRows.Close()
				return nil, err
			}
			infoSystems := []ReportInfoSystem{}
			for isRows.Next() {
				var isID int64
				isys := ReportInfoSystem{}
				if err := isRows.Scan(&isID, &isys.Name, &isys.Code, &isys.IsID); err != nil {
					isRows.Close()
					streamRows.Close()
					return nil, err
				}
				isys.ID = &isID
				vmRows, err := a.DB.Query(ctx, `
					SELECT fqdn, ip, cpu, ram, disk, ba_pfm_zak, ba_pfm_isp, ba_programma_byudzheta, ba_finansovaya_pozitsiya, ba_mir_kod
					FROM inventory_vm
					WHERE info_system_id=$1
					ORDER BY fqdn
				`, isID)
				if err != nil {
					isRows.Close()
					streamRows.Close()
					return nil, err
				}
				for vmRows.Next() {
					vm := ReportVM{}
					if err := vmRows.Scan(&vm.FQDN, &vm.IP, &vm.CPU, &vm.RAM, &vm.Disk, &vm.BAPFMZak, &vm.BAPFMIsp, &vm.BAProgrammaByudzheta, &vm.BAFinansovayaPozitsiya, &vm.BAMirKod); err != nil {
						vmRows.Close()
						isRows.Close()
						streamRows.Close()
						return nil, err
					}
					vm.InfoSystemDeleted = false
					isys.VMs = append(isys.VMs, vm)
					isys.VMCount++
					isys.SumCPU += vm.CPU
					isys.SumRAM += vm.RAM
					isys.SumDisk += vm.Disk
				}
				vmRows.Close()
				infoSystems = append(infoSystems, isys)
				stream.VMCount += isys.VMCount
				stream.SumCPU += isys.SumCPU
				stream.SumRAM += isys.SumRAM
				stream.SumDisk += isys.SumDisk
			}
			isRows.Close()
			stream.InfoSystems = infoSystems
			stream.HasExceeded = (stream.CPUQuota > 0 && stream.SumCPU > stream.CPUQuota) || (stream.RAMQuota > 0 && stream.SumRAM > stream.RAMQuota) || (stream.DiskQuota > 0 && stream.SumDisk > stream.DiskQuota)
			streams = append(streams, stream)
			dept.VMCount += stream.VMCount
			dept.SumCPU += stream.SumCPU
			dept.SumRAM += stream.SumRAM
			dept.SumDisk += stream.SumDisk
		}
		streamRows.Close()
		dept.Streams = streams
		dept.HasExceeded = (dept.CPUQuota > 0 && dept.SumCPU > dept.CPUQuota) || (dept.RAMQuota > 0 && dept.SumRAM > dept.RAMQuota) || (dept.DiskQuota > 0 && dept.SumDisk > dept.DiskQuota)
		result = append(result, dept)
	}

	orphanRows, err := a.DB.Query(ctx, `
		SELECT fqdn, ip, cpu, ram, disk, ba_pfm_zak, ba_pfm_isp, ba_programma_byudzheta, ba_finansovaya_pozitsiya, ba_mir_kod
		FROM inventory_vm WHERE info_system_id IS NULL ORDER BY fqdn
	`)
	if err != nil {
		return result, nil
	}
	defer orphanRows.Close()
	orphanVMs := []ReportVM{}
	sumCPU, sumRAM, sumDisk := 0, 0, 0
	for orphanRows.Next() {
		vm := ReportVM{InfoSystemDeleted: true}
		if err := orphanRows.Scan(&vm.FQDN, &vm.IP, &vm.CPU, &vm.RAM, &vm.Disk, &vm.BAPFMZak, &vm.BAPFMIsp, &vm.BAProgrammaByudzheta, &vm.BAFinansovayaPozitsiya, &vm.BAMirKod); err != nil {
			return result, nil
		}
		orphanVMs = append(orphanVMs, vm)
		sumCPU += vm.CPU
		sumRAM += vm.RAM
		sumDisk += vm.Disk
	}
	if len(orphanVMs) > 0 {
		orphanID := (*int64)(nil)
		result = append(result, ReportDepartment{
			ID:        orphanID,
			Name:      "(ВМ без ИС / удалённая ИС)",
			ShortName: "",
			Streams: []ReportStream{
				{
					ID:          nil,
					Name:        "—",
					CPUQuota:    0,
					RAMQuota:    0,
					DiskQuota:   0,
					HasExceeded: false,
					VMCount:     len(orphanVMs),
					SumCPU:      sumCPU,
					SumRAM:      sumRAM,
					SumDisk:     sumDisk,
					InfoSystems: []ReportInfoSystem{
						{
							ID:      nil,
							Name:    "—",
							Code:    "",
							IsID:    "",
							VMs:     orphanVMs,
							VMCount: len(orphanVMs),
							SumCPU:  sumCPU,
							SumRAM:  sumRAM,
							SumDisk: sumDisk,
						},
					},
				},
			},
			VMCount: len(orphanVMs),
			SumCPU:  sumCPU,
			SumRAM:  sumRAM,
			SumDisk: sumDisk,
		})
	}
	return result, nil
}

func toBlob(v any) []byte {
	b := bytes.NewBuffer(nil)
	_ = json.NewEncoder(b).Encode(v)
	return b.Bytes()
}

var _ = chi.NewRouter
