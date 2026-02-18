from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm

from .models import Department, VM


def build_report_pdf():
    """Build hierarchical report PDF (Department -> Stream -> IS -> VMs)."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 2 * cm
    c.setFont("Helvetica-Bold", 14)
    c.drawString(2 * cm, y, "VM Inventory — Report")
    y -= 1.5 * cm

    departments = Department.objects.prefetch_related(
        'streams__info_systems__vms'
    ).all()
    orphan = VM.objects.filter(info_system__isnull=True)

    for dept in departments:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(2 * cm, y, dept.name)
        y -= 0.8 * cm
        for stream in dept.streams.all():
            c.setFont("Helvetica", 11)
            c.drawString(3 * cm, y, "  %s" % stream.name)
            y -= 0.6 * cm
            for isys in stream.info_systems.all():
                c.setFont("Helvetica", 10)
                c.drawString(4 * cm, y, "  %s" % isys.name)
                y -= 0.5 * cm
                vms_list = list(isys.vms.all())
                for vm in vms_list:
                    if y < 2 * cm:
                        c.showPage()
                        y = height - 2 * cm
                    c.drawString(5 * cm, y, "  • %s" % vm.fqdn)
                    y -= 0.4 * cm
                if vms_list:
                    sum_cpu = sum(vm.cpu for vm in vms_list)
                    sum_ram = sum(vm.ram for vm in vms_list)
                    sum_disk = sum(vm.disk for vm in vms_list)
                    tot = "  Итого: %d ВМ, CPU: %d, RAM: %d ГБ, Диск: %d ГБ" % (len(vms_list), sum_cpu, sum_ram, sum_disk)
                    if y < 2 * cm:
                        c.showPage()
                        y = height - 2 * cm
                    c.setFont("Helvetica-Bold", 9)
                    c.drawString(5 * cm, y, tot)
                    y -= 0.5 * cm
                y -= 0.2 * cm
            y -= 0.2 * cm
        y -= 0.3 * cm

    if orphan.exists():
        if y < 3 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFont("Helvetica-Bold", 11)
        c.drawString(2 * cm, y, "(VM without IS / deleted IS)")
        y -= 0.6 * cm
        orphan_list = list(orphan)
        for vm in orphan_list:
            if y < 2 * cm:
                c.showPage()
                y = height - 2 * cm
            c.setFont("Helvetica", 10)
            c.drawString(3 * cm, y, "  • %s" % vm.fqdn)
            y -= 0.4 * cm
        sum_cpu = sum(vm.cpu for vm in orphan_list)
        sum_ram = sum(vm.ram for vm in orphan_list)
        sum_disk = sum(vm.disk for vm in orphan_list)
        tot = "  Итого: %d ВМ, CPU: %d, RAM: %d ГБ, Диск: %d ГБ" % (len(orphan_list), sum_cpu, sum_ram, sum_disk)
        if y < 2 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFont("Helvetica-Bold", 9)
        c.drawString(3 * cm, y, tot)
        y -= 0.5 * cm

    c.save()
    buf.seek(0)
    return buf
