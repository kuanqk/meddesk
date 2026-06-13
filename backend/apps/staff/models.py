from decimal import Decimal

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
    macdent_id = models.CharField(
        "ID в MacDent",
        max_length=50,
        null=True,
        blank=True,
        unique=True,
        help_text="ID врача в системе MacDent (из doctor/find)",
    )
    kpi_threshold = models.DecimalField(
        "KPI порог",
        max_digits=12,
        decimal_places=2,
        default=Decimal("4500000"),
        help_text="KPI порог для повышенной ставки",
    )
    rate_below_kpi = models.DecimalField(
        "Ставка до KPI (%)",
        max_digits=5,
        decimal_places=2,
        default=Decimal("30.00"),
        help_text="Ставка % до KPI",
    )
    rate_above_kpi = models.DecimalField(
        "Ставка сверх KPI (%)",
        max_digits=5,
        decimal_places=2,
        default=Decimal("35.00"),
        help_text="Ставка % сверх KPI",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Сотрудник"
        verbose_name_plural = "Сотрудники"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_role_display()})"
