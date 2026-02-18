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
    path('import/departments/', import_export.ImportDepartmentsView.as_view(), name='import-departments'),
    path('import/streams/', import_export.ImportStreamsView.as_view(), name='import-streams'),
    path('import/info-systems/', import_export.ImportInfoSystemsView.as_view(), name='import-info-systems'),
    path('import/vms/', import_export.ImportVMsView.as_view(), name='import-vms'),
    path('import/pools/', import_export.ImportPoolsView.as_view(), name='import-pools'),
    path('search/', import_export.search, name='search'),
]
