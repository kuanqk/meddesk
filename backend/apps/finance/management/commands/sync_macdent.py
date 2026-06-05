from datetime import date, datetime

from django.core.management.base import BaseCommand, CommandError

from apps.finance.services.sync import FinanceSyncService


class Command(BaseCommand):
    help = "Синхронизация данных из MacDent API за указанный период"

    def add_arguments(self, parser):
        today = date.today().isoformat()
        parser.add_argument(
            "--from",
            dest="date_from",
            default=today,
            metavar="YYYY-MM-DD",
            help="Начало периода (по умолчанию: сегодня)",
        )
        parser.add_argument(
            "--to",
            dest="date_to",
            default=today,
            metavar="YYYY-MM-DD",
            help="Конец периода (по умолчанию: сегодня)",
        )

    def handle(self, *args, **options):
        try:
            date_from = datetime.strptime(options["date_from"], "%Y-%m-%d").date()
            date_to = datetime.strptime(options["date_to"], "%Y-%m-%d").date()
        except ValueError as e:
            raise CommandError(f"Неверный формат даты: {e}")

        if date_from > date_to:
            raise CommandError("--from не может быть позже --to")

        self.stdout.write(f"Синхронизация MacDent: {date_from} — {date_to}")

        try:
            saved = FinanceSyncService().sync_period(date_from, date_to)
        except Exception as e:
            raise CommandError(f"Синхронизация завершилась с ошибкой: {e}")

        self.stdout.write(self.style.SUCCESS(f"Готово. Сохранено записей: {saved}"))
