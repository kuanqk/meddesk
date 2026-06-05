from django.urls import path

from .views import (
    DailyReportClosedDatesView,
    DailyReportCloseView,
    DailyReportReopenView,
    DailyReportView,
    FinanceBalancesView,
    FinanceDailyView,
    FinanceExpensesView,
    FinanceSummaryView,
)

urlpatterns = [
    path("summary/",                    FinanceSummaryView.as_view(),         name="finance-summary"),
    path("daily/",                      FinanceDailyView.as_view(),           name="finance-daily"),
    path("expenses/",                   FinanceExpensesView.as_view(),        name="finance-expenses"),
    path("balances/",                   FinanceBalancesView.as_view(),        name="finance-balances"),
    path("daily-report/",               DailyReportView.as_view(),            name="finance-daily-report"),
    path("daily-report/close/",         DailyReportCloseView.as_view(),       name="finance-daily-report-close"),
    path("daily-report/reopen/",        DailyReportReopenView.as_view(),      name="finance-daily-report-reopen"),
    path("daily-report/closed-dates/",  DailyReportClosedDatesView.as_view(), name="finance-daily-report-closed-dates"),
]
