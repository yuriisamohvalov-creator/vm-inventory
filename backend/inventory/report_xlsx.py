"""Экспорт отчёта в XLSX формат."""
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

from .models import Department, VM


def build_report_xlsx():
    """Build hierarchical report XLSX (Department -> Stream -> IS -> VMs)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "VM Inventory Report"
    
    # Заголовок
    ws.merge_cells('A1:F1')
    ws['A1'] = 'VM Inventory — Report'
    ws['A1'].font = Font(bold=True, size=14)
    ws['A1'].alignment = Alignment(horizontal='center')
    row = 3
    
    # Стили
    header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
    header_font = Font(bold=True, color='FFFFFF')
    dept_fill = PatternFill(start_color='D9E1F2', end_color='D9E1F2', fill_type='solid')
    dept_font = Font(bold=True)
    stream_fill = PatternFill(start_color='E7E6E6', end_color='E7E6E6', fill_type='solid')
    stream_font = Font(bold=True)
    is_fill = PatternFill(start_color='F2F2F2', end_color='F2F2F2', fill_type='solid')
    
    departments = Department.objects.prefetch_related(
        'streams__info_systems__vms'
    ).all()
    orphan = VM.objects.filter(info_system__isnull=True)
    
    for dept in departments:
        dept_vm_count = 0
        dept_sum_cpu = 0
        dept_sum_ram = 0
        dept_sum_disk = 0
        
        # Департамент
        ws.merge_cells(f'A{row}:F{row}')
        ws[f'A{row}'] = dept.name
        ws[f'A{row}'].fill = dept_fill
        ws[f'A{row}'].font = dept_font
        row += 1
        
        for stream in dept.streams.all():
            stream_vm_count = 0
            stream_sum_cpu = 0
            stream_sum_ram = 0
            stream_sum_disk = 0
            
            # Стрим
            ws.merge_cells(f'B{row}:F{row}')
            ws[f'B{row}'] = stream.name
            ws[f'B{row}'].fill = stream_fill
            ws[f'B{row}'].font = stream_font
            row += 1
            
            for isys in stream.info_systems.all():
                vms_list = list(isys.vms.all())
                if vms_list:
                    # ИС заголовок
                    ws.merge_cells(f'C{row}:F{row}')
                    ws[f'C{row}'] = isys.name
                    ws[f'C{row}'].fill = is_fill
                    ws[f'C{row}'].font = Font(bold=True)
                    row += 1
                    
                    # Заголовки колонок ВМ
                    ws[f'D{row}'] = 'FQDN'
                    ws[f'E{row}'] = 'CPU'
                    ws[f'F{row}'] = 'RAM (ГБ)'
                    ws[f'G{row}'] = 'Диск (ГБ)'
                    for col in ['D', 'E', 'F', 'G']:
                        ws[f'{col}{row}'].fill = header_fill
                        ws[f'{col}{row}'].font = header_font
                    row += 1
                    
                    # ВМ
                    for vm in vms_list:
                        ws[f'D{row}'] = vm.fqdn
                        ws[f'E{row}'] = vm.cpu
                        ws[f'F{row}'] = vm.ram
                        ws[f'G{row}'] = vm.disk
                        row += 1
                    
                    # Итого ИС
                    sum_cpu = sum(vm.cpu for vm in vms_list)
                    sum_ram = sum(vm.ram for vm in vms_list)
                    sum_disk = sum(vm.disk for vm in vms_list)
                    ws[f'D{row}'] = f'Итого ИС: {len(vms_list)} ВМ'
                    ws[f'E{row}'] = sum_cpu
                    ws[f'F{row}'] = sum_ram
                    ws[f'G{row}'] = sum_disk
                    ws[f'D{row}'].font = Font(bold=True)
                    row += 1
                    
                    stream_vm_count += len(vms_list)
                    stream_sum_cpu += sum_cpu
                    stream_sum_ram += sum_ram
                    stream_sum_disk += sum_disk
                
                if stream_vm_count > 0:
                    # Итого Стрим
                    ws[f'C{row}'] = f'Итого Стрим: {stream_vm_count} ВМ'
                    ws[f'E{row}'] = stream_sum_cpu
                    ws[f'F{row}'] = stream_sum_ram
                    ws[f'G{row}'] = stream_sum_disk
                    ws[f'C{row}'].font = Font(bold=True)
                    ws[f'C{row}'].fill = stream_fill
                    row += 1
                    
                    dept_vm_count += stream_vm_count
                    dept_sum_cpu += stream_sum_cpu
                    dept_sum_ram += stream_sum_ram
                    dept_sum_disk += stream_sum_disk
        
        if dept_vm_count > 0:
            # Итого Департамент
            ws[f'A{row}'] = f'Итого Департамент: {dept_vm_count} ВМ'
            ws[f'E{row}'] = dept_sum_cpu
            ws[f'F{row}'] = dept_sum_ram
            ws[f'G{row}'] = dept_sum_disk
            ws[f'A{row}'].font = Font(bold=True)
            ws[f'A{row}'].fill = dept_fill
            row += 1
    
    # ВМ без ИС
    if orphan.exists():
        orphan_list = list(orphan)
        ws.merge_cells(f'A{row}:F{row}')
        ws[f'A{row}'] = '(ВМ без ИС / удалённая ИС)'
        ws[f'A{row}'].fill = dept_fill
        ws[f'A{row}'].font = dept_font
        row += 1
        
        ws[f'D{row}'] = 'FQDN'
        ws[f'E{row}'] = 'CPU'
        ws[f'F{row}'] = 'RAM (ГБ)'
        ws[f'G{row}'] = 'Диск (ГБ)'
        for col in ['D', 'E', 'F', 'G']:
            ws[f'{col}{row}'].fill = header_fill
            ws[f'{col}{row}'].font = header_font
        row += 1
        
        for vm in orphan_list:
            ws[f'D{row}'] = vm.fqdn
            ws[f'E{row}'] = vm.cpu
            ws[f'F{row}'] = vm.ram
            ws[f'G{row}'] = vm.disk
            row += 1
        
        sum_cpu = sum(vm.cpu for vm in orphan_list)
        sum_ram = sum(vm.ram for vm in orphan_list)
        sum_disk = sum(vm.disk for vm in orphan_list)
        ws[f'D{row}'] = f'Итого: {len(orphan_list)} ВМ'
        ws[f'E{row}'] = sum_cpu
        ws[f'F{row}'] = sum_ram
        ws[f'G{row}'] = sum_disk
        ws[f'D{row}'].font = Font(bold=True)
    
    # Автоподбор ширины колонок
    for col in ws.columns:
        max_length = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[col_letter].width = adjusted_width
    
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
