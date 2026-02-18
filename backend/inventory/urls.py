from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import import_export

router = DefaultRouter()
router.register('departments', views.DepartmentViewSet, basename='department')
router.register('streams', views.StreamViewSet, basename='stream')
router.register('info-systems', views.InfoSystemViewSet, basename='infosystem')
router.register('vms', views.VMViewSet, basename='vm')
router.register('pools', views.PoolViewSet, basename='pool')
router.register('report', views.ReportViewSet, basename='report')

urlpatterns = [
    path('', include(router.urls)),
    # Импорт эндпоинты согласно промту
    path('v1/departments/import', import_export.ImportDepartmentsView.as_view(), name='import-departments'),
    path('v1/streams/import', import_export.ImportStreamsView.as_view(), name='import-streams'),
    path('v1/infosystems/import', import_export.ImportInfoSystemsView.as_view(), name='import-info-systems'),
    path('v1/vm/import', import_export.ImportVMsView.as_view(), name='import-vms'),
    path('v1/pools/import', import_export.ImportPoolsView.as_view(), name='import-pools'),
    # Поиск с поддержкой section
    path('v1/search', import_export.search, name='search'),
    # Отчет в JSON
    path('v1/report/json', views.ReportViewSet.as_view({'get': 'export_json'}), name='report-json'),
    # Обратная совместимость со старыми путями
    path('import/departments/', import_export.ImportDepartmentsView.as_view(), name='import-departments-legacy'),
    path('import/streams/', import_export.ImportStreamsView.as_view(), name='import-streams-legacy'),
    path('import/info-systems/', import_export.ImportInfoSystemsView.as_view(), name='import-info-systems-legacy'),
    path('import/vms/', import_export.ImportVMsView.as_view(), name='import-vms-legacy'),
    path('import/pools/', import_export.ImportPoolsView.as_view(), name='import-pools-legacy'),
    path('search/', import_export.search, name='search-legacy'),
]
