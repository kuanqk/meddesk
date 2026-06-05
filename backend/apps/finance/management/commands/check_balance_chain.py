"""
Проверка непрерывности цепочки балансов.

Для каждого счёта проходит по всем DailyReport в хронологическом порядке
и сравнивает balance_start текущего дня с balance_end предыдущего дня
(у которого есть запись DailyBalance по этому же счёту — gap-дни пропускаются).
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.finance.models import DailyBalance

ACCOUNTS = ("kaspi_pay", "halyk", "cash")


class Command(BaseCommand):
    help = "Проверить непрерывность balance_end → balance_start по всем счетам"

    def handle(self, *args, **options):
        total_days = (
            DailyBalance.objects
            .values_list("report__date", flat=True)
            .distinct()
            .count()
        )
        breaks = 0
        clean_days = set()

        for account in ACCOUNTS:
            rows = list(
                DailyBalance.objects
                .filter(account=account)
                .select_related("report")
                .order_by("report__date")
            )
            if not rows:
                self.stdout.write(f"\n— {account}: нет данных")
                continue

            self.stdout.write(f"\n── {account} ─────────────────────────────────")
            account_breaks = 0
            prev = None
            for cur in rows:
                if prev is not None:
                    expected = prev.balance_end
                    actual = cur.balance_start
                    delta = actual - expected
                    if delta != Decimal("0"):
                        breaks += 1
                        account_breaks += 1
                        self.stdout.write(
                            f"  {cur.report.date}  {account:<10}  "
                            f"ожидалось {expected:>14,.2f}  "
                            f"фактически {actual:>14,.2f}  "
                            f"Δ={delta:+,.2f}"
                        )
                    else:
                        clean_days.add((cur.report.date, account))
                prev = cur

            self.stdout.write(f"  → {account}: {account_breaks} разрывов из {len(rows)} записей")

        self.stdout.write(f"\n{'═'*60}")
        self.stdout.write(
            f"Итого: {breaks} разрывов · {total_days} дней в БД · "
            f"{len(clean_days)} согласованных (день × счёт)"
        )
