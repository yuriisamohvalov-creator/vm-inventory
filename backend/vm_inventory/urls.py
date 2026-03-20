from django.contrib import admin
from django.urls import path, include, re_path
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from django.conf import settings

schema_view = get_schema_view(
    openapi.Info(
        title='VM Inventory API',
        default_version='v1',
        description='API для учёта ВМ: справочники, импорт из JSON, поиск, отчёты.',
    ),
    public=settings.DEBUG,
    permission_classes=[permissions.AllowAny if settings.DEBUG else permissions.IsAdminUser],
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('inventory.urls')),
    # Swagger UI согласно промту
    path('api/docs/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    # Обратная совместимость
    re_path(r'^swagger(?P<format>\.json|\.yaml)$', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui-legacy'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]
