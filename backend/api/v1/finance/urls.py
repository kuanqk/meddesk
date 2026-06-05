from django.urls import path

from .views import (
    DailyReportView,
    FinanceBalancesView,
    FinanceDailyView,
    FinanceExpensesView,
    FinanceSummaryView,
)

urlpatterns = [
    path("summary/",      FinanceSummaryView.as_view(),  name="finance-summary"),
    path("daily/",        FinanceDailyView.as_view(),    name="finance-daily"),
    path("expenses/",     FinanceExpensesView.as_view(), name="finance-expenses"),
    path("balances/",     FinanceBalancesView.as_view(), name="finance-balances"),
    path("daily-report/", DailyReportView.as_view(),     name="finance-daily-report"),
]
