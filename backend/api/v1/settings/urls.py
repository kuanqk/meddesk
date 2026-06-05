from django.urls import path

from .views import PermissionsView, TabsListView

urlpatterns = [
    path("tabs/",        TabsListView.as_view(),   name="settings-tabs"),
    path("permissions/", PermissionsView.as_view(), name="settings-permissions"),
]
