package app

import (
	"bytes"
	"fmt"

	"github.com/jung-kurt/gofpdf/v2"
	"github.com/xuri/excelize/v2"
)

func BuildPDFReport(data []ReportDepartment) ([]byte, error) {
	pdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: "L",
		UnitStr:        "mm",
		SizeStr:        "A4",
	})
	pdf.AddPage()
	pdf.SetFont("Helvetica", "B", 14)
	pdf.Cell(0, 8, "VM Inventory - Report")
	pdf.Ln(10)

	for _, dept := range data {
		pdf.SetFont("Helvetica", "B", 11)
		deptLine := dept.Name
		if dept.ID != nil {
			deptLine = fmt.Sprintf("%s (VM: %d, CPU: %d", dept.Name, dept.VMCount, dept.SumCPU)
			if dept.CPUQuota > 0 {
				deptLine += fmt.Sprintf("/%d", dept.CPUQuota)
			}
			deptLine += fmt.Sprintf(", RAM: %d", dept.SumRAM)
			if dept.RAMQuota > 0 {
				deptLine += fmt.Sprintf("/%d", dept.RAMQuota)
			}
			deptLine += fmt.Sprintf(" GB, Disk: %d", dept.SumDisk)
			if dept.DiskQuota > 0 {
				deptLine += fmt.Sprintf("/%d", dept.DiskQuota)
			}
			deptLine += " GB)"
		}
		if dept.HasExceeded {
			deptLine = "!! " + deptLine
		}
		pdf.Cell(0, 7, deptLine)
		pdf.Ln(7)
		for _, stream := range dept.Streams {
			pdf.SetFont("Helvetica", "", 10)
			streamLine := fmt.Sprintf("  %s (%d VM, CPU %d", stream.Name, stream.VMCount, stream.SumCPU)
			if stream.CPUQuota > 0 {
				streamLine += fmt.Sprintf("/%d", stream.CPUQuota)
			}
			streamLine += fmt.Sprintf(", RAM %d", stream.SumRAM)
			if stream.RAMQuota > 0 {
				streamLine += fmt.Sprintf("/%d", stream.RAMQuota)
			}
			streamLine += fmt.Sprintf(" GB, Disk %d", stream.SumDisk)
			if stream.DiskQuota > 0 {
				streamLine += fmt.Sprintf("/%d", stream.DiskQuota)
			}
			streamLine += " GB)"
			if stream.HasExceeded {
				streamLine = "  !! " + streamLine
			}
			pdf.Cell(0, 6, streamLine)
			pdf.Ln(6)
			for _, isys := range stream.InfoSystems {
				pdf.SetFont("Helvetica", "", 9)
				pdf.Cell(0, 5, "    "+isys.Name)
				pdf.Ln(5)
				for _, vm := range isys.VMs {
					pdf.Cell(0, 4, fmt.Sprintf("      - %s (%s) CPU:%d RAM:%dGB Disk:%dGB", vm.FQDN, vm.IP, vm.CPU, vm.RAM, vm.Disk))
					pdf.Ln(4)
					pdf.Cell(0, 4, fmt.Sprintf("        BA.PFM_zak:%s BA.PFM_isp:%s BA.Program:%s", vm.BAPFMZak, vm.BAPFMIsp, safeString(vm.BAProgrammaByudzheta)))
					pdf.Ln(4)
					pdf.Cell(0, 4, fmt.Sprintf("        BA.Position:%s BA.Mir:%s", vm.BAFinansovayaPozitsiya, vm.BAMirKod))
					pdf.Ln(4)
				}
			}
		}
		pdf.Ln(3)
	}
	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func BuildXLSXReport(data []ReportDepartment) ([]byte, error) {
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	f.SetSheetName(sheet, "VM Inventory Report")
	sheet = "VM Inventory Report"
	_ = f.SetPageLayout(sheet, &excelize.PageLayoutOptions{
		Orientation: stringPtr("landscape"),
	})
	row := 1
	_ = f.MergeCell(sheet, "A1", "M1")
	_ = f.SetCellValue(sheet, "A1", "VM Inventory - Report")
	row += 2
	for _, dept := range data {
		_ = f.MergeCell(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("M%d", row))
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", row), dept.Name)
		row++
		for _, stream := range dept.Streams {
			_ = f.MergeCell(sheet, fmt.Sprintf("B%d", row), fmt.Sprintf("M%d", row))
			streamText := fmt.Sprintf("Итого Стрим: %d ВМ, CPU: %d", stream.VMCount, stream.SumCPU)
			if stream.CPUQuota > 0 {
				streamText = fmt.Sprintf("Итого Стрим: %d ВМ, CPU: %d/%d", stream.VMCount, stream.SumCPU, stream.CPUQuota)
			}
			streamText += fmt.Sprintf(", RAM: %d", stream.SumRAM)
			if stream.RAMQuota > 0 {
				streamText += fmt.Sprintf("/%d", stream.RAMQuota)
			}
			streamText += fmt.Sprintf(" ГБ, Диск: %d", stream.SumDisk)
			if stream.DiskQuota > 0 {
				streamText += fmt.Sprintf("/%d", stream.DiskQuota)
			}
			streamText += " ГБ"
			if stream.HasExceeded {
				streamText = "🚨 " + streamText
			}
			_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", row), streamText)
			row++
			for _, isys := range stream.InfoSystems {
				_ = f.MergeCell(sheet, fmt.Sprintf("C%d", row), fmt.Sprintf("M%d", row))
				_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", row), isys.Name)
				row++
				headers := []string{"FQDN", "IP", "CPU", "RAM (ГБ)", "Диск (ГБ)", "БА.ПФМ_зак", "БА.ПФМ_исп", "БА.Программа_бюджета", "БА.Финансовая_позиция", "БА.Mir-код"}
				for i, h := range headers {
					col := string(rune('D' + i))
					_ = f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), h)
				}
				row++
				for _, vm := range isys.VMs {
					_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", row), vm.FQDN)
					_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", row), vm.IP)
					_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", row), vm.CPU)
					_ = f.SetCellValue(sheet, fmt.Sprintf("G%d", row), vm.RAM)
					_ = f.SetCellValue(sheet, fmt.Sprintf("H%d", row), vm.Disk)
					_ = f.SetCellValue(sheet, fmt.Sprintf("I%d", row), vm.BAPFMZak)
					_ = f.SetCellValue(sheet, fmt.Sprintf("J%d", row), vm.BAPFMIsp)
					_ = f.SetCellValue(sheet, fmt.Sprintf("K%d", row), safeString(vm.BAProgrammaByudzheta))
					_ = f.SetCellValue(sheet, fmt.Sprintf("L%d", row), vm.BAFinansovayaPozitsiya)
					_ = f.SetCellValue(sheet, fmt.Sprintf("M%d", row), vm.BAMirKod)
					row++
				}
				_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", row), fmt.Sprintf("Итого ИС: %d ВМ", isys.VMCount))
				_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", row), isys.SumCPU)
				_ = f.SetCellValue(sheet, fmt.Sprintf("G%d", row), isys.SumRAM)
				_ = f.SetCellValue(sheet, fmt.Sprintf("H%d", row), isys.SumDisk)
				row++
			}
		}
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("Итого Департамент: %d ВМ, CPU: %d", dept.VMCount, dept.SumCPU))
		row++
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func safeString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func stringPtr(v string) *string { return &v }
