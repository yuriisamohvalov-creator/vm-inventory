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
        import logging
        logger = logging.getLogger(__name__)
        format_type = request.query_params.get('format', 'pdf').lower()
        logger.info(f'ReportExportView.get called with format={format_type}')
        
        try:
            if format_type == 'json':
                return report_json_response()
            elif format_type == 'xlsx':
                buf = build_report_xlsx()
                buf.seek(0)
                content = buf.read()
                logger.info(f'XLSX buffer size: {len(content)}')
                response = HttpResponse(content, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                response['Content-Disposition'] = 'attachment; filename="vm-inventory-report.xlsx"'
                return response
            else:  # pdf по умолчанию
                buf = build_report_pdf()
                buf.seek(0)
                content = buf.read()
                logger.info(f'PDF buffer size: {len(content)}')
                response = HttpResponse(content, content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="vm-inventory-report.pdf"'
                return response
        except Exception as e:
            logger.error(f'Error in ReportExportView.get: {e}', exc_info=True)
            raise
