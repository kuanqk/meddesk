from django.contrib import admin

from .models import (
    DailyBalance,
    DailyReport,
    DailyTransaction,
    DoctorRevenue,
    MacDentSync,
    PayrollCalculation,
    TransactionCategory,
)


@admin.register(MacDentSync)
class MacDentSyncAdmin(admin.ModelAdmin):
    list_display = ("synced_at", "period_from", "period_to", "status", "records_saved")
    list_filter = ("status",)
    readonly_fields = ("synced_at", "raw_response")


@admin.register(DoctorRevenue)
class DoctorRevenueAdmin(admin.ModelAdmin):
    list_display = ("doctor", "date", "revenue", "hours_worked", "patients_count", "source")
    list_filter = ("source", "doctor")
    date_hierarchy = "date"
    search_fields = ("doctor__name",)


@admin.register(PayrollCalculation)
class PayrollCalculationAdmin(admin.ModelAdmin):
    list_display = (
        "staff_member", "period", "revenue_total", "kpi_threshold",
        "payroll_total", "is_confirmed", "confirmed_at",
    )
    list_filter = ("is_confirmed", "period")
    readonly_fields = ("confirmed_at",)
    search_fields = ("staff_member__name",)


@admin.register(TransactionCategory)
class TransactionCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "color", "order")
    list_filter = ("type",)
    list_editable = ("order",)


class DailyTransactionInline(admin.TabularInline):
    model = DailyTransaction
    extra = 0


class DailyBalanceInline(admin.TabularInline):
    model = DailyBalance
    extra = 0


@admin.register(DailyReport)
class DailyReportAdmin(admin.ModelAdmin):
    list_display = ("date", "created_by", "is_closed", "updated_at")
    list_filter = ("is_closed",)
    date_hierarchy = "date"
    inlines = [DailyTransactionInline, DailyBalanceInline]
    readonly_fields = ("created_at", "updated_at")


@admin.register(DailyTransaction)
class DailyTransactionAdmin(admin.ModelAdmin):
    list_display = ("report", "account", "direction", "amount", "category", "comment")
    list_filter = ("account", "direction", "category")
    search_fields = ("comment",)


@admin.register(DailyBalance)
class DailyBalanceAdmin(admin.ModelAdmin):
    list_display = ("report", "account", "balance_start", "balance_end")
    list_filter = ("account",)
