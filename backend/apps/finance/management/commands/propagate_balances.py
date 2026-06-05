"""
Распространить цепочку балансов: balance_end[n-1] → balance_start[n].

Для каждого счёта независимо:
  - первый день оставить как есть (якорь)
  - для каждого последующего дня (по DailyBalance):
        balance_start = prev_day.balance_end
        balance_end   = balance_start + Σincome − Σexpense  (из транзакций)
        DailyBalance.update_or_create(...)

Между prev и cur могут быть «gap days» (нет DailyReport) — это нормально:
balance_start cur == balance_end prev, потому что в пропущенные дни операций нет.
"""

from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Sum

from apps.finance.models import DailyBalance, DailyTransaction

ACCOUNTS = ("kaspi_pay", "halyk", "cash")


class Command(BaseCommand):
    help = "Пересчитать цепочку balance_start/balance_end (end[n-1] → start[n])"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Показать что изменится, не сохранять.",
        )
        parser.add_argument(
            "--from",
            dest="date_from",
            metavar="YYYY-MM-DD",
            help="Начать с этой даты (более ранние дни не трогать, но использовать как якорь).",
        )
        parser.add_argument(
            "--account",
            choices=ACCOUNTS,
            help=f"Обработать только один счёт (по умолчанию все: {', '.join(ACCOUNTS)}).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        date_from = None
        if options["date_from"]:
            try:
                date_from = datetime.strptime(options["date_from"], "%Y-%m-%d").date()
            except ValueError:
                raise CommandError("Неверный формат --from. Используйте YYYY-MM-DD.")

        accounts = (options["account"],) if options["account"] else ACCOUNTS

        if dry_run:
            self.stdout.write(self.style.WARNING("*** DRY RUN — изменения не сохраняются ***\n"))

        grand_updated = 0

        for account in accounts:
            self.stdout.write(f"\n── {account} ─────────────────────────────────")

            rows = list(
                DailyBalance.objects
                .filter(account=account)
                .select_related("report")
                .order_by("report__date")
            )
            if not rows:
                self.stdout.write("  Нет данных по этому счёту.")
                continue

            updated = 0
            processed = 0
            prev = None

            for cur in rows:
                processed += 1

                # Якорь = первый день в цепочке
                if prev is None:
                    prev = cur
                    continue

                # Пропускаем дни до --from (но обновляем prev, чтобы цепочка не порвалась)
                if date_from and cur.report.date < date_from:
                    prev = cur
                    continue

                new_start = prev.balance_end

                income = (
                    DailyTransaction.objects
                    .filter(report=cur.report, account=account, direction="income")
                    .aggregate(s=Sum("amount"))["s"] or Decimal("0")
                )
                expense = (
                    DailyTransaction.objects
                    .filter(report=cur.report, account=account, direction="expense")
                    .aggregate(s=Sum("amount"))["s"] or Decimal("0")
                )
                new_end = new_start + income - expense

                changed = (
                    new_start != cur.balance_start
                    or new_end != cur.balance_end
                )

                if changed:
                    delta_start = new_start - cur.balance_start
                    if dry_run:
                        self.stdout.write(
                            f"  {cur.report.date}  start {cur.balance_start:>14,.2f} → {new_start:>14,.2f} "
                            f"(Δ={delta_start:+,.2f})  end → {new_end:>14,.2f}"
                        )
                    else:
                        with db_transaction.atomic():
                            DailyBalance.objects.filter(pk=cur.pk).update(
                                balance_start=new_start,
                                balance_end=new_end,
                            )
                        # Refresh local copy so the next iteration uses new value
                        cur.balance_start = new_start
                        cur.balance_end = new_end
                    updated += 1

                prev = cur

                if processed % 50 == 0:
                    flag = "[dry-run] " if dry_run else ""
                    self.stdout.write(f"  {flag}обработано {processed}/{len(rows)} (обновлено {updated})")

            self.stdout.write(
                f"  → {account}: {updated} балансов "
                f"{'будет обновлено' if dry_run else 'обновлено'} из {processed} проверенных"
            )
            grand_updated += updated

        self.stdout.write(f"\n{'═'*60}")
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"DRY RUN: {grand_updated} балансов будет обновлено."
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"Готово. Обновлено балансов: {grand_updated}"
            ))
