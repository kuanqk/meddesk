from django.core.exceptions import ValidationError
from django.db import models

from apps.accounts.models import Clinic
from apps.staff.models import StaffMember


class Room(models.Model):
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="rooms",
        verbose_name="Клиника",
    )
    number = models.CharField("Номер кабинета", max_length=16)
    is_active = models.BooleanField("Активен", default=True)

    class Meta:
        verbose_name = "Кабинет"
        verbose_name_plural = "Кабинеты"
        unique_together = [("clinic", "number")]
        ordering = ["number"]

    def __str__(self):
        return f"Кабинет {self.number}"


class WeekTemplate(models.Model):
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="week_templates",
        verbose_name="Клиника",
    )
    name = models.CharField("Название", max_length=255)
    year = models.PositiveIntegerField("Год")
    month = models.PositiveIntegerField("Месяц")
    week_number = models.PositiveIntegerField("Номер недели", default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Шаблон недели"
        verbose_name_plural = "Шаблоны недель"
        ordering = ["-year", "-month", "week_number"]

    def __str__(self):
        return f"{self.name} ({self.year}-{self.month:02d})"


class DaySlot(models.Model):
    week_template = models.ForeignKey(
        WeekTemplate,
        on_delete=models.CASCADE,
        related_name="day_slots",
        verbose_name="Неделя",
    )
    staff_member = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name="day_slots",
        verbose_name="Сотрудник",
    )
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="day_slots",
        verbose_name="Кабинет",
    )
    date = models.DateField("Дата")

    class Meta:
        verbose_name = "Дневной слот"
        verbose_name_plural = "Дневные слоты"
        ordering = ["date", "room"]

    def __str__(self):
        return f"{self.staff_member.name} — {self.date} — {self.room}"


class HourSlot(models.Model):
    day_slot = models.ForeignKey(
        DaySlot,
        on_delete=models.CASCADE,
        related_name="hour_slots",
        verbose_name="Дневной слот",
    )
    hour = models.PositiveSmallIntegerField("Час")

    class Meta:
        verbose_name = "Часовой слот"
        verbose_name_plural = "Часовые слоты"
        unique_together = [("day_slot", "hour")]
        ordering = ["hour"]

    def __str__(self):
        return f"{self.day_slot} — {self.hour}:00"

    def clean(self):
        super().clean()
        staff = self.day_slot.staff_member
        date = self.day_slot.date
        room = self.day_slot.room

        if staff.role == StaffMember.Role.DOCTOR:
            conflict = HourSlot.objects.filter(
                day_slot__date=date,
                day_slot__room=room,
                hour=self.hour,
            ).exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError(
                    "Врач уже занят в этом кабинете в этот час."
                )

        if staff.role == StaffMember.Role.ANESTHESIOLOGIST:
            conflict = HourSlot.objects.filter(
                day_slot__date=date,
                day_slot__staff_member__role=StaffMember.Role.ANESTHESIOLOGIST,
                hour=self.hour,
            ).exclude(day_slot__staff_member=staff).exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError(
                    "Анестезиолог уже занят в этот час."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
