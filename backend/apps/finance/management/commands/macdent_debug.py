import json

from django.core.management.base import BaseCommand

from apps.finance.services.macdent import MacDentClient


class Command(BaseCommand):
    help = "Debug MacDent API responses"

    def handle(self, *args, **options):
        client = MacDentClient()

        self.stdout.write("=== DOCTORS ===")
        doctors = client.get_doctors()
        self.stdout.write(json.dumps(doctors[:3], ensure_ascii=False, indent=2))

        self.stdout.write("=== PAYMENTS 2026-06-01 to 2026-06-05 ===")
        payments = client.get_payments("2026-06-01", "2026-06-05")
        self.stdout.write(f"Total: {len(payments)}")
        if payments:
            self.stdout.write(json.dumps(payments[0], ensure_ascii=False, indent=2))
