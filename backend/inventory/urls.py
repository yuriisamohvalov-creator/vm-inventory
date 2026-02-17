from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('departments', views.DepartmentViewSet, basename='department')
router.register('streams', views.StreamViewSet, basename='stream')
router.register('info-systems', views.InfoSystemViewSet, basename='infosystem')
router.register('vms', views.VMViewSet, basename='vm')
router.register('pools', views.PoolViewSet, basename='pool')
router.register('report', views.ReportViewSet, basename='report')

urlpatterns = [
    path('', include(router.urls)),
]
