from rest_framework import status, viewsets
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from apps.accounts.permissions import IsOwnerOrAdmin, user_tabs
from apps.staff.models import StaffMember

from .serializers import StaffMemberSerializer


class CanReadStaff(BasePermission):
    """Read access for anyone with the schedule OR finance tab."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        tabs = user_tabs(user)
        return "schedule" in tabs or "finance" in tabs


class StaffMemberViewSet(viewsets.ModelViewSet):
    serializer_class = StaffMemberSerializer
    queryset = StaffMember.objects.select_related("clinic").prefetch_related(
        "salary_rule"
    )

    def get_permissions(self):
        # Reads: anyone with the schedule or finance tab.
        # Writes: owner/admin only.
        if self.request.method in SAFE_METHODS:
            return [CanReadStaff()]
        return [IsOwnerOrAdmin()]

    def get_queryset(self):
        queryset = super().get_queryset()
        clinic_id = self.request.query_params.get("clinic")
        if clinic_id:
            queryset = queryset.filter(clinic_id=clinic_id)
        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        return queryset.filter(is_active=True)

    def destroy(self, request, *args, **kwargs):
        """Soft-delete: mark inactive instead of removing the row.

        Keeps the staff member's financial history (DoctorRevenue,
        PayrollCalculation) intact. The member drops out of all listings
        because get_queryset() filters on is_active=True.
        """
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)
