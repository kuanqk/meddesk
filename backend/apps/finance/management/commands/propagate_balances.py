"""
Распространить цепочку балансов: balance_end[n-1] → balance_start[n].

Математика вынесена в apps.finance.services.balances.propagate_balances_forward
(тот же сервис, что использует DailyReportView.post). Команда остаётся как
health-check: `--dry-run` показывает расхождения, не сохраняя.

Для каждого счёта независимо:
  - первый день — якорь (не трогается);
  - для каждого последующего дня:
        balance_start = balance_end предыдущего дня
        balance_end   = balance_start + Σincome − Σexpense
Между днями могут быть «gap days» (нет DailyReport) — это нормально.
"""

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from apps.finance.services.balances import ACCOUNTS, propagate_balances_forward


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

        diffs = propagate_balances_forward(
            from_date=date_from, commit=not dry_run, accounts=accounts
        )

        by_account: dict[str, list] = {a: [] for a in accounts}
        for d in diffs:
            by_account.setdefault(d["account"], []).append(d)

        grand_updated = 0
        for account in accounts:
            self.stdout.write(f"\n── {account} ─────────────────────────────────")
            acc_diffs = by_account.get(account, [])
            for d in acc_diffs:
                delta = d["new_start"] - d["old_start"]
                self.stdout.write(
                    f"  {d['date']}  start {d['old_start']:>14,.2f} → {d['new_start']:>14,.2f} "
                    f"(Δ={delta:+,.2f})  end → {d['new_end']:>14,.2f}"
                )
            verb = "будет обновлено" if dry_run else "обновлено"
            self.stdout.write(f"  → {account}: {len(acc_diffs)} балансов {verb}")
            grand_updated += len(acc_diffs)

        self.stdout.write(f"\n{'═'*60}")
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"DRY RUN: {grand_updated} балансов будет обновлено."
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"Готово. Обновлено балансов: {grand_updated}"
            ))
