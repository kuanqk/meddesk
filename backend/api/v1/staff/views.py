from decimal import Decimal, InvalidOperation

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from apps.accounts.permissions import IsOwnerOrAdmin, is_owner, user_tabs
from apps.staff.models import StaffMember
from apps.staff.services.payroll_calc import calculate_doctor_salary

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
    queryset = StaffMember.objects.select_related("clinic")

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

    @action(detail=True, methods=["get"], url_path="salary-preview")
    def salary_preview(self, request, pk=None):
        """GET /api/v1/staff/{id}/salary-preview/?revenue=N — owner only.

        Previews KPI-based salary for a hypothetical monthly revenue. SAFE
        methods are readable by non-owners (get_permissions), so the owner
        gate is enforced explicitly here — salary figures are owner-only.
        """
        if not is_owner(request.user):
            return Response(
                {"detail": "Только владелец может смотреть расчёт зарплаты."},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw = request.query_params.get("revenue", "")
        try:
            revenue = Decimal(raw)
        except (InvalidOperation, TypeError):
            return Response({"detail": "revenue должен быть числом."}, status=400)
        if revenue < 0:
            return Response({"detail": "revenue не может быть отрицательным."}, status=400)

        staff = self.get_object()
        salary = calculate_doctor_salary(staff, revenue)
        return Response({
            "staff_id": staff.id,
            "revenue": str(revenue),
            "below": str(salary["below"]),
            "above": str(salary["above"]),
            "salary": str(salary["total"]),
        })
