from decimal import Decimal

from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.accounts.permissions import is_owner
from apps.staff.models import SalaryRule, StaffMember

# KPI / payroll-rate fields — owner-only for both read and write.
KPI_FIELDS = ("kpi_threshold", "rate_below_kpi", "rate_above_kpi")


class SalaryRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryRule
        fields = (
            "base_rate",
            "elevated_rate",
            "revenue_threshold",
            "deduct_implant",
            "deduct_lab",
        )


class StaffMemberSerializer(serializers.ModelSerializer):
    salary_rule = SalaryRuleSerializer(required=False, allow_null=True)

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
            "salary_rule",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def _request_user_is_owner(self) -> bool:
        request = self.context.get("request")
        return bool(request and is_owner(request.user))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        try:
            data["salary_rule"] = SalaryRuleSerializer(instance.salary_rule).data
        except SalaryRule.DoesNotExist:
            data["salary_rule"] = None

        # KPI/payroll rates are owner-only. Hide them from everyone else.
        if not self._request_user_is_owner():
            for field in KPI_FIELDS:
                data.pop(field, None)
        return data

    def create(self, validated_data):
        salary_data = validated_data.pop("salary_rule", None)
        staff_member = StaffMember.objects.create(**validated_data)
        if salary_data:
            SalaryRule.objects.create(staff_member=staff_member, **salary_data)
        return staff_member

    def update(self, instance, validated_data):
        salary_data = validated_data.pop("salary_rule", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if salary_data is not None:
            SalaryRule.objects.update_or_create(
                staff_member=instance,
                defaults=salary_data,
            )
        return instance

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

        salary_rule = attrs.get("salary_rule")
        if salary_rule:
            for field in ("base_rate", "elevated_rate", "revenue_threshold"):
                if salary_rule.get(field) is not None and salary_rule[field] < Decimal("0"):
                    raise serializers.ValidationError(
                        {field: "Значение не может быть отрицательным."}
                    )
        return attrs
