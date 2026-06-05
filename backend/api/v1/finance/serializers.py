from rest_framework import serializers


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
