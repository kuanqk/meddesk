"""Mark all historically-imported DailyReports as closed."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.finance.models import DailyReport


class Command(BaseCommand):
    help = "Закрыть все дни, импортированные из Excel (где source_file != '')"

    def handle(self, *args, **options):
        qs = DailyReport.objects.exclude(source_file="").filter(is_closed=False)
        total = qs.count()

        if total == 0:
            self.stdout.write("Нет открытых импортированных дней.")
            return

        updated = qs.update(
            is_closed=True,
            closed_by=None,
            closed_at=timezone.now(),
        )

        self.stdout.write(self.style.SUCCESS(f"Закрыто дней: {updated} / {total}"))
