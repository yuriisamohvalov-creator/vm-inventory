from io import BytesIO

from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from .models import Department, VM

# Регистрируем шрифт с поддержкой кириллицы
_font_registered = False
try:
    import os
    # Попытка найти системные шрифты с поддержкой кириллицы
    font_normal_paths = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/TTF/DejaVuSans.ttf',
    ]
    font_bold_paths = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    ]
    
    normal_path = None
    bold_path = None
    
    for path in font_normal_paths:
        if os.path.exists(path):
            normal_path = path
            break
    
    for path in font_bold_paths:
        if os.path.exists(path):
            bold_path = path
            break
    
    # Если нашли хотя бы обычный шрифт
    if normal_path:
        try:
            pdfmetrics.registerFont(TTFont('UnicodeFont', normal_path))
            if bold_path:
                pdfmetrics.registerFont(TTFont('UnicodeFontBold', bold_path))
            else:
                # Используем обычный шрифт для bold (будет выглядеть как обычный, но лучше чем квадратики)
                pdfmetrics.registerFont(TTFont('UnicodeFontBold', normal_path))
            _font_registered = True
        except Exception:
            pass
except Exception:
    pass


def _get_font(font_name='Helvetica'):
    """Возвращает имя шрифта с поддержкой кириллицы или fallback."""
    if _font_registered:
        return 'UnicodeFont' if font_name == 'Helvetica' else 'UnicodeFontBold'
    return font_name


def _draw_vm_budget_block(c, x, y, vm, font_normal, page_height):
    """Рисует компактный бюджетный блок в 2 строки и возвращает новый y."""
    if y < 2.2 * cm:
        c.showPage()
        y = page_height - 2 * cm
    c.setFont(font_normal, 8)
    line1 = "    БА.ПФМ_зак: %s, БА.ПФМ_исп: %s, БА.Программа_бюджета: %s" % (
        vm.ba_pfm_zak or "-",
        vm.ba_pfm_isp or "-",
        vm.ba_programma_byudzheta or "-",
    )
    line2 = "    БА.Финансовая_позиция: %s, БА.Mir-код: %s" % (
        vm.ba_finansovaya_pozitsiya or "-",
        vm.ba_mir_kod or "-",
    )
    c.drawString(x, y, line1)
    y -= 0.35 * cm
    if y < 2 * cm:
        c.showPage()
        y = page_height - 2 * cm
        c.setFont(font_normal, 8)
    c.drawString(x, y, line2)
    y -= 0.4 * cm
    return y


def build_report_pdf():
    """Build hierarchical report PDF (Department -> Stream -> IS -> VMs)."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    width, height = landscape(A4)
    y = height - 2 * cm
    
    font_normal = _get_font('Helvetica')
    font_bold = _get_font('Helvetica-Bold')
    
    c.setFont(font_bold, 14)
    c.drawString(2 * cm, y, "VM Inventory — Report")
    y -= 1.5 * cm

    departments = Department.objects.prefetch_related(
        'streams__info_systems__vms'
    ).all()
    orphan = VM.objects.filter(info_system__isnull=True)

    for dept in departments:
        dept_vm_count = 0
        dept_sum_cpu = 0
        dept_sum_ram = 0
        dept_sum_disk = 0
        # Проверка превышения квот
        dept_has_exceeded = False
        c.setFont(font_bold, 12)
        dept_title = dept.name
        if dept.cpu_quota > 0 or dept.ram_quota > 0 or dept.disk_quota > 0:
            # Проверим после подсчета сумм
            pass
        c.drawString(2 * cm, y, dept_title)
        y -= 0.8 * cm
        for stream in dept.streams.all():
            stream_vm_count = 0
            stream_sum_cpu = 0
            stream_sum_ram = 0
            stream_sum_disk = 0
            c.setFont(font_normal, 11)
            c.drawString(3 * cm, y, "  %s" % stream.name)
            y -= 0.6 * cm
            for isys in stream.info_systems.all():
                c.setFont(font_normal, 10)
                c.drawString(4 * cm, y, "  %s" % isys.name)
                y -= 0.5 * cm
                vms_list = list(isys.vms.all())
                for vm in vms_list:
                    if y < 2 * cm:
                        c.showPage()
                        y = height - 2 * cm
                    c.setFont(font_normal, 9)
                    vm_text = "  • %s (%s)" % (vm.fqdn, vm.ip)
                    if vm.info_system is None:
                        vm_text += " [ИС УДАЛЕНА]"
                    vm_text += " (CPU: %d, RAM: %d ГБ, Диск: %d ГБ)" % (vm.cpu, vm.ram, vm.disk)
                    c.drawString(5 * cm, y, vm_text)
                    y -= 0.4 * cm
                    y = _draw_vm_budget_block(c, 5 * cm, y, vm, font_normal, height)
                if vms_list:
                    sum_cpu = sum(vm.cpu for vm in vms_list)
                    sum_ram = sum(vm.ram for vm in vms_list)
                    sum_disk = sum(vm.disk for vm in vms_list)
                    tot = "  Итого ИС: %d ВМ, CPU: %d, RAM: %d ГБ, Диск: %d ГБ" % (len(vms_list), sum_cpu, sum_ram, sum_disk)
                    if y < 2 * cm:
                        c.showPage()
                        y = height - 2 * cm
                    c.setFont(font_bold, 9)
                    c.drawString(5 * cm, y, tot)
                    y -= 0.5 * cm
                    stream_vm_count += len(vms_list)
                    stream_sum_cpu += sum_cpu
                    stream_sum_ram += sum_ram
                    stream_sum_disk += sum_disk
                y -= 0.2 * cm
            if stream_vm_count > 0:
                stream_has_exceeded = (
                    (stream.cpu_quota > 0 and stream_sum_cpu > stream.cpu_quota)
                    or (stream.ram_quota > 0 and stream_sum_ram > stream.ram_quota)
                    or (stream.disk_quota > 0 and stream_sum_disk > stream.disk_quota)
                )
                stream_tot = "  Итого Стрим: %d ВМ" % stream_vm_count
                if stream.cpu_quota > 0:
                    stream_tot += ", CPU: %d/%d" % (stream_sum_cpu, stream.cpu_quota)
                else:
                    stream_tot += ", CPU: %d" % stream_sum_cpu
                if stream.ram_quota > 0:
                    stream_tot += ", RAM: %d/%d ГБ" % (stream_sum_ram, stream.ram_quota)
                else:
                    stream_tot += ", RAM: %d ГБ" % stream_sum_ram
                if stream.disk_quota > 0:
                    stream_tot += ", Диск: %d/%d ГБ" % (stream_sum_disk, stream.disk_quota)
                else:
                    stream_tot += ", Диск: %d ГБ" % stream_sum_disk
                if y < 2 * cm:
                    c.showPage()
                    y = height - 2 * cm
                c.setFont(font_bold, 10)
                if stream_has_exceeded:
                    c.drawString(3 * cm, y, "🚨 " + stream_tot)
                else:
                    c.drawString(3 * cm, y, stream_tot)
                y -= 0.6 * cm
                dept_vm_count += stream_vm_count
                dept_sum_cpu += stream_sum_cpu
                dept_sum_ram += stream_sum_ram
                dept_sum_disk += stream_sum_disk
            y -= 0.2 * cm
        if dept_vm_count > 0:
            # Проверка превышения квот
            if dept.cpu_quota > 0 and dept_sum_cpu > dept.cpu_quota:
                dept_has_exceeded = True
            if dept.ram_quota > 0 and dept_sum_ram > dept.ram_quota:
                dept_has_exceeded = True
            if dept.disk_quota > 0 and dept_sum_disk > dept.disk_quota:
                dept_has_exceeded = True
            
            dept_tot = "Итого Департамент: %d ВМ" % dept_vm_count
            if dept.cpu_quota > 0:
                dept_tot += ", CPU: %d/%d" % (dept_sum_cpu, dept.cpu_quota)
            else:
                dept_tot += ", CPU: %d" % dept_sum_cpu
            if dept.ram_quota > 0:
                dept_tot += ", RAM: %d/%d ГБ" % (dept_sum_ram, dept.ram_quota)
            else:
                dept_tot += ", RAM: %d ГБ" % dept_sum_ram
            if dept.disk_quota > 0:
                dept_tot += ", Диск: %d/%d ГБ" % (dept_sum_disk, dept.disk_quota)
            else:
                dept_tot += ", Диск: %d ГБ" % dept_sum_disk
            
            if y < 2 * cm:
                c.showPage()
                y = height - 2 * cm
            c.setFont(font_bold, 11)
            if dept_has_exceeded:
                c.drawString(2 * cm, y, "🚨 " + dept_tot)
            else:
                c.drawString(2 * cm, y, dept_tot)
            y -= 0.7 * cm
        y -= 0.3 * cm

    if orphan.exists():
        if y < 3 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFont(font_bold, 11)
        c.drawString(2 * cm, y, "(ВМ без ИС / удалённая ИС)")
        y -= 0.6 * cm
        orphan_list = list(orphan)
        for vm in orphan_list:
            if y < 2 * cm:
                c.showPage()
                y = height - 2 * cm
            c.setFont(font_normal, 9)
            vm_text = "  • %s (%s) [ИС УДАЛЕНА]" % (vm.fqdn, vm.ip)
            vm_text += " (CPU: %d, RAM: %d ГБ, Диск: %d ГБ)" % (vm.cpu, vm.ram, vm.disk)
            c.drawString(3 * cm, y, vm_text)
            y -= 0.4 * cm
            y = _draw_vm_budget_block(c, 3 * cm, y, vm, font_normal, height)
        sum_cpu = sum(vm.cpu for vm in orphan_list)
        sum_ram = sum(vm.ram for vm in orphan_list)
        sum_disk = sum(vm.disk for vm in orphan_list)
        tot = "  Итого: %d ВМ, CPU: %d, RAM: %d ГБ, Диск: %d ГБ" % (len(orphan_list), sum_cpu, sum_ram, sum_disk)
        if y < 2 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFont(font_bold, 9)
        c.drawString(3 * cm, y, tot)
        y -= 0.5 * cm

    c.save()
    buf.seek(0)
    return buf
