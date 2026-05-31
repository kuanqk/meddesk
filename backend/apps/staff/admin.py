from django.contrib import admin

from .models import SalaryRule, StaffMember


class SalaryRuleInline(admin.StackedInline):
    model = SalaryRule
    extra = 0


@admin.register(StaffMember)
class StaffMemberAdmin(admin.ModelAdmin):
    list_display = ("name", "role", "clinic", "color", "is_active")
    list_filter = ("role", "clinic", "is_active")
    search_fields = ("name",)
    inlines = [SalaryRuleInline]


@admin.register(SalaryRule)
class SalaryRuleAdmin(admin.ModelAdmin):
    list_display = (
        "staff_member",
        "base_rate",
        "elevated_rate",
        "revenue_threshold",
    )
