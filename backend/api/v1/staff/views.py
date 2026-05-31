from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from apps.staff.models import StaffMember

from .serializers import StaffMemberSerializer


class StaffMemberViewSet(viewsets.ModelViewSet):
    serializer_class = StaffMemberSerializer
    permission_classes = [AllowAny]  # TODO: restrict after auth is wired up
    queryset = StaffMember.objects.select_related("clinic").prefetch_related(
        "salary_rule"
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        clinic_id = self.request.query_params.get("clinic")
        if clinic_id:
            queryset = queryset.filter(clinic_id=clinic_id)
        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        return queryset.filter(is_active=True)
