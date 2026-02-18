"""Отдельный APIView для экспорта отчетов."""
from django.http import HttpResponse
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
            buf.seek(0)
            response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = 'attachment; filename="vm-inventory-report.xlsx"'
            return response
        else:  # pdf по умолчанию
            buf = build_report_pdf()
            buf.seek(0)
            response = HttpResponse(buf.read(), content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="vm-inventory-report.pdf"'
            return response
