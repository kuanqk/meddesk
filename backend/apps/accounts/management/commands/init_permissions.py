"""
Seed RoleTabAccess from the hardcoded TAB_ACCESS defaults.
Safe to run multiple times — uses update_or_create.
"""

from django.core.management.base import BaseCommand

from apps.accounts.models import RoleTabAccess
from apps.accounts.permissions import TAB_ACCESS

ROLE_LABELS = {
    "owner":            "Владелец",
    "admin":            "Администратор",
    "doctor":           "Врач",
    "anesthesiologist": "Анестезиолог",
    "receptionist":     "Регистратор",
}


class Command(BaseCommand):
    help = "Заполнить таблицу RoleTabAccess значениями по умолчанию"

    def handle(self, *args, **options):
        for role, tabs in TAB_ACCESS.items():
            obj, created = RoleTabAccess.objects.update_or_create(
                role=role,
                defaults={"tabs": list(tabs)},
            )
            action = "создан" if created else "обновлён"
            label = ROLE_LABELS.get(role, role)
            self.stdout.write(
                self.style.SUCCESS(f"  {action:8}  {label} ({role})  →  {list(tabs)}")
            )

        self.stdout.write(self.style.SUCCESS(f"\nГотово. Записей: {RoleTabAccess.objects.count()}"))
