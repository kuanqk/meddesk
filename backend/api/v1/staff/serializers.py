from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.accounts.permissions import is_owner
from apps.staff.models import StaffMember

# KPI / payroll-rate fields — owner-only for both read and write.
KPI_FIELDS = ("kpi_threshold", "rate_below_kpi", "rate_above_kpi")


class StaffMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffMember
        fields = (
            "id",
            "clinic",
            "name",
            "role",
            "color",
            "is_active",
            "kpi_threshold",
            "rate_below_kpi",
            "rate_above_kpi",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def _request_user_is_owner(self) -> bool:
        request = self.context.get("request")
        return bool(request and is_owner(request.user))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # KPI/payroll rates are owner-only. Hide them from everyone else.
        if not self._request_user_is_owner():
            for field in KPI_FIELDS:
                data.pop(field, None)
        return data

    def validate_color(self, value):
        if not value.startswith("#") or len(value) not in (4, 7):
            raise serializers.ValidationError("Цвет должен быть в формате #RGB или #RRGGBB.")
        return value

    def validate(self, attrs):
        # KPI/payroll rates may only be written by the owner.
        if any(field in attrs for field in KPI_FIELDS) and not self._request_user_is_owner():
            raise PermissionDenied(
                "Только владелец может изменять KPI-показатели и ставки."
            )
        return attrs
