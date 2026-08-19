from django.urls import path

from .views import (
    DailyReportClosedDatesView,
    DailyReportCloseView,
    DailyReportReopenView,
    DailyReportView,
    DoctorsRevenueExportView,
    DoctorsRevenueView,
    FinanceBalancesView,
    FinanceDailyView,
    FinanceExpensesView,
    FinanceSummaryView,
    IncomeExportView,
    PayrollCalculateView,
    PayrollConfirmView,
    PayrollListView,
    PayrollUnconfirmView,
)

urlpatterns = [
    path("summary/",                    FinanceSummaryView.as_view(),         name="finance-summary"),
    path("income/export/",              IncomeExportView.as_view(),           name="finance-income-export"),
    path("daily/",                      FinanceDailyView.as_view(),           name="finance-daily"),
    path("expenses/",                   FinanceExpensesView.as_view(),        name="finance-expenses"),
    path("balances/",                   FinanceBalancesView.as_view(),        name="finance-balances"),
    path("doctors-revenue/",            DoctorsRevenueView.as_view(),         name="finance-doctors-revenue"),
    path("doctors-revenue/export/",     DoctorsRevenueExportView.as_view(),   name="finance-doctors-revenue-export"),
    path("daily-report/",               DailyReportView.as_view(),            name="finance-daily-report"),
    path("daily-report/close/",         DailyReportCloseView.as_view(),       name="finance-daily-report-close"),
    path("daily-report/reopen/",        DailyReportReopenView.as_view(),      name="finance-daily-report-reopen"),
    path("daily-report/closed-dates/",  DailyReportClosedDatesView.as_view(), name="finance-daily-report-closed-dates"),
    path("payroll/",                    PayrollListView.as_view(),            name="finance-payroll-list"),
    path("payroll/calculate/",          PayrollCalculateView.as_view(),       name="finance-payroll-calculate"),
    path("payroll/<int:pk>/confirm/",   PayrollConfirmView.as_view(),         name="finance-payroll-confirm"),
    path("payroll/<int:pk>/unconfirm/", PayrollUnconfirmView.as_view(),       name="finance-payroll-unconfirm"),
]
