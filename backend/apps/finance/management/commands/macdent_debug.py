import json

from django.core.management.base import BaseCommand

from apps.finance.services.macdent import MacDentClient


class Command(BaseCommand):
    help = "Debug MacDent API responses"

    def handle(self, *args, **options):
        import requests
        from django.conf import settings

        TOKEN = settings.MACDENT_API_TOKEN
        BASE = "https://api-developer.macdent.kz"

        self.stdout.write(f"Token: {TOKEN[:20]}...")

        self.stdout.write("\n=== RAW doctor/find ===")
        r = requests.post(f"{BASE}/doctor/find", data={"access_token": TOKEN}, timeout=30)
        self.stdout.write(json.dumps(r.json(), ensure_ascii=False, indent=2)[:2000])

        self.stdout.write("\n=== RAW payment/find 2026-06-01 to 2026-06-05 ===")
        r = requests.post(f"{BASE}/payment/find", data={
            "access_token": TOKEN,
            "date_from": "2026-06-01",
            "date_to": "2026-06-05",
        }, timeout=30)
        raw = r.json()
        self.stdout.write(json.dumps(raw, ensure_ascii=False, indent=2)[:2000])
