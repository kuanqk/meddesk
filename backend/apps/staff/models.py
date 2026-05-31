from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.accounts.models import Clinic


class StaffMember(models.Model):
    class Role(models.TextChoices):
        DOCTOR = "doctor", "Врач"
        ANESTHESIOLOGIST = "anesthesiologist", "Анестезиолог"

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="staff_members",
        verbose_name="Клиника",
    )
    name = models.CharField("Имя", max_length=255)
    role = models.CharField("Роль", max_length=32, choices=Role.choices)
    color = models.CharField("Цвет", max_length=7, default="#3B82F6")
    is_active = models.BooleanField("Активен", default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Сотрудник"
        verbose_name_plural = "Сотрудники"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_role_display()})"


class SalaryRule(models.Model):
    staff_member = models.OneToOneField(
        StaffMember,
        on_delete=models.CASCADE,
        related_name="salary_rule",
        verbose_name="Сотрудник",
    )
    base_rate = models.DecimalField(
        "Базовая ставка",
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    elevated_rate = models.DecimalField(
        "Повышенная ставка",
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    revenue_threshold = models.DecimalField(
        "Порог выручки",
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
        default=Decimal("0"),
    )
    deduct_implant = models.BooleanField("Вычитать импланты", default=False)
    deduct_lab = models.BooleanField("Вычитать лабораторию", default=False)

    class Meta:
        verbose_name = "Правило оплаты"
        verbose_name_plural = "Правила оплаты"

    def __str__(self):
        return f"Ставка: {self.staff_member.name}"
