from django.contrib.auth.models import AbstractUser
from django.db import models


class RoleTabAccess(models.Model):
    """Per-role tab permissions stored in DB. Overrides hardcoded defaults."""

    role = models.CharField("Роль", max_length=32, unique=True)
    tabs = models.JSONField("Вкладки", default=list)

    class Meta:
        verbose_name = "Доступ роли к вкладкам"
        verbose_name_plural = "Доступ ролей к вкладкам"

    def __str__(self):
        return f"{self.role} → {self.tabs}"


class User(AbstractUser):
    """Custom user model for future clinic membership support."""

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"


class Clinic(models.Model):
    name = models.CharField("Название", max_length=255)
    slug = models.SlugField("Slug", unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Клиника"
        verbose_name_plural = "Клиники"

    def __str__(self):
        return self.name


class ClinicMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Владелец"
        ADMIN = "admin", "Администратор"
        DOCTOR = "doctor", "Врач"
        ANESTHESIOLOGIST = "anesthesiologist", "Анестезиолог"
        RECEPTIONIST = "receptionist", "Регистратор"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="memberships",
        verbose_name="Пользователь",
    )
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="memberships",
        verbose_name="Клиника",
    )
    role = models.CharField("Роль", max_length=32, choices=Role.choices)
    is_active = models.BooleanField("Активен", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Членство в клинике"
        verbose_name_plural = "Членства в клиниках"
        unique_together = [("user", "clinic")]

    def __str__(self):
        return f"{self.user} — {self.clinic} ({self.role})"
