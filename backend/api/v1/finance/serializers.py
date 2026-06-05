from decimal import Decimal

from rest_framework import serializers


# ── DailyReport I/O ────────────────────────────────────────────────────────────

class DailyTransactionInputSerializer(serializers.Serializer):
    account   = serializers.ChoiceField(choices=["kaspi_pay", "halyk", "cash"])
    direction = serializers.ChoiceField(choices=["income", "expense"])
    amount    = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    comment   = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    row_order = serializers.IntegerField(required=False, default=0)


class OpeningBalancesSerializer(serializers.Serializer):
    kaspi_pay = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=Decimal("0"))
    halyk     = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=Decimal("0"))
    cash      = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=Decimal("0"))


class DailyReportSaveSerializer(serializers.Serializer):
    date             = serializers.DateField()
    transactions     = DailyTransactionInputSerializer(many=True)
    opening_balances = OpeningBalancesSerializer(required=False)
    notes            = serializers.CharField(required=False, allow_blank=True, default="")


# ── Analytics serializers ──────────────────────────────────────────────────────

class MonthlySummarySerializer(serializers.Serializer):
    month = serializers.CharField()
    income = serializers.DecimalField(max_digits=16, decimal_places=2)
    expenses = serializers.DecimalField(max_digits=16, decimal_places=2)
    profit = serializers.DecimalField(max_digits=16, decimal_places=2)
    kaspi_balance_end = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)
    halyk_balance_end = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)
    cash_balance_end = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)


class DailySummarySerializer(serializers.Serializer):
    date = serializers.DateField()
    income = serializers.DecimalField(max_digits=16, decimal_places=2)
    expenses = serializers.DecimalField(max_digits=16, decimal_places=2)
    profit = serializers.DecimalField(max_digits=16, decimal_places=2)
    total_balance_end = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)


class ExpenseCategorySerializer(serializers.Serializer):
    category = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=16, decimal_places=2)
    percentage = serializers.FloatField()


class DailyBalanceSerializer(serializers.Serializer):
    date = serializers.DateField()
    kaspi = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)
    halyk = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)
    cash = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)
    total = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)
