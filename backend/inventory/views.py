import io
import json
import pandas as pd
from django.http import HttpResponse, JsonResponse, FileResponse
from django.template.loader import render_to_string
from django.db import models
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from weasyprint import HTML
from .models import Department
from .serializers import DepartmentReportSerializer

class ReportBaseView(APIView):
    """Базовый класс для получения данных отчета"""
    def get_report_data(self):
        departments = Department.objects.prefetch_related(
            'stream_set__infosystem_set__vm_set'
        ).all()
        serializer = DepartmentReportSerializer(departments, many=True)
        return serializer.data

class ReportJSONView(ReportBaseView):
    """Экспорт отчета в JSON"""
    def get(self, request, format=None):
        data = self.get_report_data()
        
        # Создаем JSON строку с отступами для читаемости
        json_str = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        
        # Возвращаем как файл для скачивания
        response = HttpResponse(json_str, content_type='application/json')
        response['Content-Disposition'] = 'attachment; filename="vm_report.json"'
        response['Content-Length'] = len(json_str)
        return response

class ReportPDFView(ReportBaseView):
    """Экспорт отчета в PDF"""
    def get(self, request):
        data = self.get_report_data()
        
        # Рендерим HTML
        html_string = render_to_string('report_pdf.html', {'departments': data})
        
        # Генерируем PDF
        pdf_file = HTML(string=html_string).write_pdf()
        
        # Возвращаем как файл для скачивания
        response = HttpResponse(pdf_file, content_type='application/pdf')
        response['Content-Disposition'] = 'attachment; filename="vm_report.pdf"'
        response['Content-Length'] = len(pdf_file)
        return response

class ReportXLSXView(ReportBaseView):
    """Экспорт отчета в XLSX"""
    def get(self, request):
        data = self.get_report_data()
        
        # Подготавливаем данные для плоской таблицы
        rows = []
        for dept in data:
            dept_name = dept['name']
            for stream in dept['streams']:
                stream_name = stream['name']
                for isys in stream['info_systems']:
                    isys_name = isys['name']
                    for vm in isys['vms']:
                        rows.append({
                            'Департамент': dept_name,
                            'Стрим': stream_name,
                            'ИС': isys_name,
                            'FQDN': vm['fqdn'],
                            'IP': vm['ip'],
                            'CPU': vm['cpu'],
                            'RAM (ГБ)': vm['ram'],
                            'Disk (ГБ)': vm['disk'],
                            'Instance': vm['instance'],
                            'Теги': ', '.join(vm['tags']) if vm['tags'] else ''
                        })
        
        # Создаем DataFrame и сохраняем в XLSX
        df = pd.DataFrame(rows)
        output = io.BytesIO()
        
        # Используем context manager для записи Excel
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='VM Report', index=False)
        
        # Получаем значение из BytesIO
        excel_data = output.getvalue()
        output.close()
        
        # Возвращаем как файл для скачивания
        response = HttpResponse(
            excel_data,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="vm_report.xlsx"'
        response['Content-Length'] = len(excel_data)
        return response