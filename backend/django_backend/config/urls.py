from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from . import admin as site_admin  # noqa: F401  (users, admin logs, site titles)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('accounts.urls')),
    path('api/', include('cards.urls')),
    path('api/', include('payments.urls')),
    path('api/', include('adminpanel.urls')),
]

if settings.ENABLE_API_DOCS:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='api-schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='api-schema'), name='api-docs'),
        path('api/redoc/', SpectacularRedocView.as_view(url_name='api-schema'), name='api-redoc'),
    ]
