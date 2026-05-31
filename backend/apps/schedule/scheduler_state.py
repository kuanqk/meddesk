from django.db import models

from apps.accounts.models import Clinic


class SchedulerState(models.Model):
    """Full scheduler snapshot (people, schedule grid, expenses) as JSON."""

    clinic = models.OneToOneField(
        Clinic,
        on_delete=models.CASCADE,
        related_name="scheduler_state",
        verbose_name="Клиника",
    )
    data = models.JSONField("Данные", default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Состояние планировщика"
        verbose_name_plural = "Состояния планировщика"

    def __str__(self):
        return f"Scheduler — {self.clinic.name}"
