import json
import requests
from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Debug MacDent API — показывает сырые ответы всех endpoints"

    def handle(self, *args, **options):
        TOKEN = settings.MACDENT_API_TOKEN
        BASE = "https://api-developer.macdent.kz"

        today = date.today()
        week_ago = (today - timedelta(days=7)).isoformat()
        today_str = today.isoformat()

        self.stdout.write(f"Token prefix: {TOKEN[:20]}...")
        self.stdout.write(f"Date range:   {week_ago}  →  {today_str}\n")

        def post(group, method, params=None):
            payload = {"access_token": TOKEN, **(params or {})}
            r = requests.post(f"{BASE}/{group}/{method}", data=payload, timeout=30)
            r.raise_for_status()
            return r.json()

        def show(title, group, method, list_key, params=None):
            self.stdout.write(f"\n{'='*60}")
            self.stdout.write(f"  {title}  ({group}/{method})")
            self.stdout.write(f"{'='*60}")
            try:
                raw = post(group, method, params)
                # print top-level keys so we can see the envelope structure
                self.stdout.write(f"Top-level keys: {list(raw.keys())}")
                records = raw.get(list_key) or []
                if not isinstance(records, list):
                    # some endpoints wrap differently — show full raw
                    self.stdout.write("Unexpected shape — full response:")
                    self.stdout.write(json.dumps(raw, ensure_ascii=False, indent=2))
                    return
                self.stdout.write(f"Total records: {len(records)}")
                if records:
                    self.stdout.write("\n--- First record ---")
                    first = records[0]
                    self.stdout.write(f"Keys: {list(first.keys()) if isinstance(first, dict) else '(not a dict)'}")
                    self.stdout.write(json.dumps(first, ensure_ascii=False, indent=2))
                else:
                    self.stdout.write("(no records)")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"ERROR: {e}"))

        # ── profile/get ──────────────────────────────────────────────────────
        self.stdout.write(f"\n{'='*60}")
        self.stdout.write("  profile/get")
        self.stdout.write(f"{'='*60}")
        try:
            raw = post("profile", "get")
            self.stdout.write(f"Top-level keys: {list(raw.keys())}")
            self.stdout.write(json.dumps(raw, ensure_ascii=False, indent=2))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"ERROR: {e}"))

        # ── doctor/find ──────────────────────────────────────────────────────
        show("doctor/find — все врачи", "doctor", "find", "doctors")

        # ── payment/find ─────────────────────────────────────────────────────
        show(
            f"payment/find — платежи {week_ago}→{today_str}",
            "payment", "find", "pays",
            {"date_from": week_ago, "date_to": today_str},
        )

        # ── rashodi/find ─────────────────────────────────────────────────────
        show(
            f"rashodi/find — расходы {week_ago}→{today_str}",
            "rashodi", "find", "rashodi",
            {"date_from": week_ago, "date_to": today_str},
        )

        # ── zapis/find ───────────────────────────────────────────────────────
        show(
            f"zapis/find — записи пациентов {week_ago}→{today_str}",
            "zapis", "find", "zapis",
            {"date_from": week_ago, "date_to": today_str},
        )

        # ── rasp/find ────────────────────────────────────────────────────────
        show(
            f"rasp/find — расписание {week_ago}→{today_str}",
            "rasp", "find", "rasps",
            {"date_from": week_ago, "date_to": today_str},
        )

        self.stdout.write(f"\n{'='*60}")
        self.stdout.write("Готово.")
