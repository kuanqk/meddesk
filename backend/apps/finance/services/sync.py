import calendar
import logging
from datetime import date
from decimal import Decimal

from django.db.models import Sum

from apps.staff.models import StaffMember
from apps.staff.services.payroll_calc import calculate_doctor_salary

from ..models import DoctorRevenue, MacDentSync, PayrollCalculation
from .macdent import MacDentClient

logger = logging.getLogger(__name__)


class FinanceSyncService:

    def __init__(self):
        self.client = MacDentClient()

    # ── Синхронизация ──────────────────────────────────────────────────────

    def sync_today(self) -> int:
        today = date.today()
        return self.sync_period(today, today)

    def sync_period(self, date_from: date, date_to: date) -> int:
        log = MacDentSync.objects.create(
            period_from=date_from,
            period_to=date_to,
            status="running",
        )
        try:
            payments = self.client.get_payments(
                date_from.isoformat(),
                date_to.isoformat(),
            )
            saved = self._save_revenues(payments)

            log.status = "success"
            log.records_saved = saved
            log.save()
            logger.info("MacDent sync %s–%s: %d records saved", date_from, date_to, saved)
            return saved

        except Exception as e:
            log.status = "error"
            log.error_message = str(e)
            log.save()
            logger.error("MacDent sync failed: %s", e)
            raise

    def _save_revenues(self, payments: list) -> int:
        """Агрегирует платежи MacDent по (врач, дата) и сохраняет суммы.

        Один врач может иметь несколько платежей за день — их нужно
        просуммировать в одну строку DoctorRevenue, а не перезаписывать.
        Ручные/Excel-строки не трогаем (их выручка из другого источника).
        """
        from datetime import datetime

        # ── Pass 1: агрегируем платежи по ключу (staff, дата) ────────────────
        groups: dict[tuple[int, date], dict] = {}
        for p in payments:
            doctor_id = p.get("doctor")  # field is "doctor", not "doctor_id"
            if not doctor_id:
                continue
            try:
                staff = StaffMember.objects.get(macdent_id=str(doctor_id))
            except StaffMember.DoesNotExist:
                logger.warning("MacDent doctor_id=%s not matched to any StaffMember", doctor_id)
                continue

            # date comes as "DD.MM.YYYY"
            raw_date = p.get("date", "")
            try:
                pay_date = datetime.strptime(raw_date, "%d.%m.%Y").date()
            except ValueError:
                logger.warning("Cannot parse date: %s", raw_date)
                continue

            key = (staff.pk, pay_date)
            group = groups.get(key)
            if group is None:
                group = {
                    "staff": staff,
                    "date": pay_date,
                    "revenue": Decimal("0"),
                    "payments": [],
                }
                groups[key] = group
            group["revenue"] += Decimal(str(p.get("summ", 0)))  # field is "summ"
            group["payments"].append(p)

        # ── Pass 2: пишем по одной агрегированной строке на (врач, дата) ─────
        saved = 0
        for group in groups.values():
            staff = group["staff"]
            pay_date = group["date"]

            existing = DoctorRevenue.objects.filter(doctor=staff, date=pay_date).first()
            if existing and existing.source in ("excel", "manual"):
                logger.warning(
                    "manual/excel revenue exists for doctor %s date %s, skipping macdent overwrite",
                    staff.macdent_id, pay_date,
                )
                continue

            DoctorRevenue.objects.update_or_create(
                doctor=staff,
                date=pay_date,
                defaults={
                    "revenue": group["revenue"],
                    "patients_count": len(group["payments"]),
                    "source": "macdent",
                    "raw_data": group["payments"],
                    # hours_worked намеренно не в defaults: при создании
                    # сработает дефолт модели (0), при апдейте существующее
                    # значение не затирается.
                },
            )
            saved += 1
        return saved

    # ── Расчёт ФОТ ─────────────────────────────────────────────────────────

    def calculate_payroll(self, year: int, month: int) -> list:
        """Считает ФОТ за месяц по каждому врачу, у которого есть выручка."""
        _, last_day = calendar.monthrange(year, month)
        period_start = date(year, month, 1)
        period_end = date(year, month, last_day)

        revenues = (
            DoctorRevenue.objects
            .filter(date__range=[period_start, period_end])
            .values("doctor")
            .annotate(total=Sum("revenue"))
        )

        results = []
        for row in revenues:
            staff = StaffMember.objects.get(pk=row["doctor"])
            rev = row["total"]

            existing = PayrollCalculation.objects.filter(
                staff_member=staff, period=period_start
            ).first()

            # Подтверждённые расчёты не перезаписываем — их сначала
            # нужно явно снять с подтверждения (owner).
            if existing and existing.is_confirmed:
                results.append(existing)
                continue

            # Единый сервис расчёта ФОТ (тот же, что в salary-preview).
            salary = calculate_doctor_salary(staff, rev)

            obj, _ = PayrollCalculation.objects.update_or_create(
                staff_member=staff,
                period=period_start,
                defaults={
                    "revenue_total": rev,
                    "kpi_threshold": staff.kpi_threshold,
                    "rate_below_kpi": staff.rate_below_kpi,
                    "rate_above_kpi": staff.rate_above_kpi,
                    "amount_below_kpi": salary["below"],
                    "amount_above_kpi": salary["above"],
                    "payroll_total": salary["total"],
                    "is_confirmed": False,
                },
            )
            results.append(obj)

        logger.info("Payroll calculated for %d-%02d: %d staff", year, month, len(results))
        return results
