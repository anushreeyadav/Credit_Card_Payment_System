from rest_framework.routers import DefaultRouter

from .views import CardViewSet

router = DefaultRouter()
router.include_root_view = False
router.register('cards', CardViewSet, basename='card')

urlpatterns = router.urls
