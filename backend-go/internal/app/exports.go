package app

import (
	"bytes"
	"fmt"
	"os"

	"github.com/jung-kurt/gofpdf/v2"
	"github.com/xuri/excelize/v2"
)

func BuildPDFReport(data []ReportDepartment) ([]byte, error) {
	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.AddPage()
	font := ensurePDFFont(pdf)
	pdf.SetFont(font, "", 14)
	pdf.Cell(0, 8, "VM Inventory - Report")
	pdf.Ln(10)

	for _, dept := range data {
		pdf.SetFont(font, "", 11)
		deptLine := dept.Name
		if dept.ID != nil {
			deptLine = fmt.Sprintf("%s (ВМ: %d, CPU: %d", dept.Name, dept.VMCount, dept.SumCPU)
			if dept.CPUQuota > 0 {
				deptLine += fmt.Sprintf("/%d", dept.CPUQuota)
			}
			deptLine += fmt.Sprintf(", RAM: %d", dept.SumRAM)
			if dept.RAMQuota > 0 {
				deptLine += fmt.Sprintf("/%d", dept.RAMQuota)
			}
			deptLine += fmt.Sprintf(" ГБ, Диск: %d", dept.SumDisk)
			if dept.DiskQuota > 0 {
				deptLine += fmt.Sprintf("/%d", dept.DiskQuota)
			}
			deptLine += " ГБ)"
		}
		if dept.HasExceeded {
			deptLine = "!! " + deptLine
		}
		pdf.MultiCell(0, 6, deptLine, "", "L", false)
		for _, stream := range dept.Streams {
			pdf.SetFont(font, "", 10)
			streamLine := fmt.Sprintf("  %s (%d ВМ, CPU %d", stream.Name, stream.VMCount, stream.SumCPU)
			if stream.CPUQuota > 0 {
				streamLine += fmt.Sprintf("/%d", stream.CPUQuota)
			}
			streamLine += fmt.Sprintf(", RAM %d", stream.SumRAM)
			if stream.RAMQuota > 0 {
				streamLine += fmt.Sprintf("/%d", stream.RAMQuota)
			}
			streamLine += fmt.Sprintf(" ГБ, Диск %d", stream.SumDisk)
			if stream.DiskQuota > 0 {
				streamLine += fmt.Sprintf("/%d", stream.DiskQuota)
			}
			streamLine += " ГБ)"
			if stream.HasExceeded {
				streamLine = "  !! " + streamLine
			}
			pdf.MultiCell(0, 5, streamLine, "", "L", false)
			for _, isys := range stream.InfoSystems {
				pdf.SetFont(font, "", 9)
				pdf.MultiCell(0, 4.5, "    "+isys.Name, "", "L", false)
				for _, vm := range isys.VMs {
					if pdf.GetY() > 190 {
						pdf.AddPage()
					}
					drawVMCoreRow(pdf, vm)
					drawVMBudgetRow(pdf, vm)
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

func drawVMCoreRow(pdf *gofpdf.Fpdf, vm ReportVM) {
	pdf.SetFontSize(8.5)
	pdf.SetX(16)
	pdf.CellFormat(92, 4.5, vm.FQDN, "1", 0, "L", false, 0, "")
	pdf.CellFormat(34, 4.5, vm.IP, "1", 0, "L", false, 0, "")
	pdf.CellFormat(14, 4.5, fmt.Sprintf("%d", vm.CPU), "1", 0, "C", false, 0, "")
	pdf.CellFormat(14, 4.5, fmt.Sprintf("%d", vm.RAM), "1", 0, "C", false, 0, "")
	pdf.CellFormat(16, 4.5, fmt.Sprintf("%d", vm.Disk), "1", 1, "C", false, 0, "")
}

func drawVMBudgetRow(pdf *gofpdf.Fpdf, vm ReportVM) {
	pdf.SetFontSize(8)
	pdf.SetX(28)
	pdf.CellFormat(34, 4.3, "ПФМ_зак: "+vm.BAPFMZak, "1", 0, "L", false, 0, "")
	pdf.CellFormat(34, 4.3, "ПФМ_исп: "+vm.BAPFMIsp, "1", 0, "L", false, 0, "")
	pdf.CellFormat(58, 4.3, "Программа: "+safeString(vm.BAProgrammaByudzheta), "1", 0, "L", false, 0, "")
	pdf.CellFormat(52, 4.3, "Фин.позиция: "+vm.BAFinansovayaPozitsiya, "1", 0, "L", false, 0, "")
	pdf.CellFormat(50, 4.3, "Mir-код: "+vm.BAMirKod, "1", 1, "L", false, 0, "")
}

func ensurePDFFont(pdf *gofpdf.Fpdf) string {
	paths := []string{
		"/app/fonts/DejaVuSans.ttf",
		"/usr/share/fonts/dejavu/DejaVuSans.ttf",
		"/usr/share/fonts/TTF/DejaVuSans.ttf",
		"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			pdf.AddUTF8Font("DejaVu", "", "fonts/DejaVuSans.ttf")
			if !pdf.Err() {
				return "DejaVu"
			}
		}
	}
	return "Helvetica"
}
