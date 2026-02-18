from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, StreamViewSet, InfoSystemViewSet,
    VMViewSet, PoolViewSet,
    ReportJSONView, ReportPDFView, ReportXLSXView  # Добавлен ReportXLSXView
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet)
router.register(r'streams', StreamViewSet)
router.register(r'info-systems', InfoSystemViewSet)
router.register(r'vms', VMViewSet)
router.register(r'pools', PoolViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('report/json/', ReportJSONView.as_view(), name='report-json'),
    path('report/pdf/', ReportPDFView.as_view(), name='report-pdf'),
    path('report/xlsx/', ReportXLSXView.as_view(), name='report-xlsx'),  # Новый маршрут
]