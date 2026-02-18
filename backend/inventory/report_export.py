"""Отдельный APIView для экспорта отчетов."""
from django.http import FileResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from .report_pdf import build_report_pdf
from .report_xlsx import build_report_xlsx
from .import_export import report_json_response


class ReportExportView(APIView):
    """APIView для экспорта отчетов в различных форматах."""
    permission_classes = [AllowAny]

    def get(self, request):
        """Выгрузка отчёта в различных форматах: pdf, xlsx, json."""
        format_type = request.query_params.get('format', 'pdf').lower()
        
        if format_type == 'json':
            return report_json_response()
        elif format_type == 'xlsx':
            buf = build_report_xlsx()
            return FileResponse(
                buf,
                as_attachment=True,
                filename='vm-inventory-report.xlsx',
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
        else:  # pdf по умолчанию
            buf = build_report_pdf()
            return FileResponse(
                buf,
                as_attachment=True,
                filename='vm-inventory-report.pdf',
                content_type='application/pdf',
            )
