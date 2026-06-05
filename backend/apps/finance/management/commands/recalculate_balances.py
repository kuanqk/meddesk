"""
Recalculate DailyBalance.balance_end for every DailyReport.

For each report, balance_end per account is computed as:
    balance_start + sum(income transactions) − sum(expense transactions)

balance_start is preserved (do not touch).
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from apps.finance.models import DailyBalance, DailyReport

ACCOUNTS = ("kaspi_pay", "halyk", "cash")


class Command(BaseCommand):
    help = "Пересчитать balance_end для всех DailyReport (на основе транзакций)"

    def handle(self, *args, **options):
        qs = DailyReport.objects.order_by("date")
        total = qs.count()
        if total == 0:
            self.stdout.write("Нет дневных отчётов.")
            return

        updated_balances = 0
        processed_reports = 0

        for report in qs.iterator():
            # Snapshot existing start balances so we don't lose them
            starts = {
                b.account: b.balance_start
                for b in report.balances.all()
            }

            # Sum transactions by (account, direction)
            agg = (
                report.transactions
                .values("account", "direction")
                .annotate(total=Sum("amount"))
            )
            sums: dict[tuple[str, str], Decimal] = {}
            for row in agg:
                sums[(row["account"], row["direction"])] = row["total"] or Decimal("0")

            for account in ACCOUNTS:
                start = starts.get(account, Decimal("0"))
                income = sums.get((account, "income"), Decimal("0"))
                expense = sums.get((account, "expense"), Decimal("0"))
                end = start + income - expense

                DailyBalance.objects.update_or_create(
                    report=report,
                    account=account,
                    defaults={"balance_start": start, "balance_end": end},
                )
                updated_balances += 1

            processed_reports += 1
            if processed_reports % 50 == 0:
                self.stdout.write(f"  обработано {processed_reports}/{total}")

        self.stdout.write(self.style.SUCCESS(
            f"\nГотово. Отчётов: {processed_reports}, балансов записано: {updated_balances}"
        ))
