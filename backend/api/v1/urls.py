from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from api.v1.auth.views import MeView
from api.v1.scheduler.views import SchedulerStateView
from api.v1.staff.views import StaffMemberViewSet

router = DefaultRouter()
router.register("staff", StaffMemberViewSet, basename="staff")

urlpatterns = [
    path("auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("scheduler/state/", SchedulerStateView.as_view(), name="scheduler-state"),
    path("", include(router.urls)),
]
