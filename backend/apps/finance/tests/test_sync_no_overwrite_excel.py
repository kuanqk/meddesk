"""
MacDent sync must not clobber manual/Excel revenue ([C2], Sprint 2).

If a DoctorRevenue row for (doctor, date) already exists with source
"excel" or "manual", the MacDent sync skips it (logs a warning) instead of
overwriting — those figures come from a trusted manual/import source.
"""

from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.accounts.models import Clinic
from apps.finance.models import DoctorRevenue
from apps.finance.services.sync import FinanceSyncService
from apps.staff.models import StaffMember


@pytest.fixture
def clinic(db):
    return Clinic.objects.create(name="Test Clinic", slug="test-clinic")


@pytest.fixture
def doctor(clinic):
    return StaffMember.objects.create(
        clinic=clinic, name="Dr. House", role="doctor", macdent_id="777"
    )


def run_sync(payments, dfrom, dto):
    with patch("apps.finance.services.sync.MacDentClient") as MockClient:
        MockClient.return_value.get_payments.return_value = payments
        return FinanceSyncService().sync_period(dfrom, dto)


@pytest.mark.django_db
def test_excel_revenue_not_overwritten(doctor, caplog):
    pay_date = date(2026, 6, 1)
    excel_row = DoctorRevenue.objects.create(
        doctor=doctor,
        date=pay_date,
        revenue=Decimal("123456.00"),
        patients_count=9,
        hours_worked=Decimal("8.00"),
        source="excel",
        raw_data={"origin": "excel-import"},
    )

    payments = [
        {"doctor": "777", "date": "01.06.2026", "summ": 50000},
        {"doctor": "777", "date": "01.06.2026", "summ": 50000},
    ]

    with caplog.at_level("WARNING"):
        saved = run_sync(payments, pay_date, pay_date)

    # nothing written for this (doctor, date)
    assert saved == 0
    assert DoctorRevenue.objects.filter(doctor=doctor, date=pay_date).count() == 1

    excel_row.refresh_from_db()
    assert excel_row.source == "excel"
    assert excel_row.revenue == Decimal("123456.00")
    assert excel_row.patients_count == 9
    assert excel_row.hours_worked == Decimal("8.00")
    assert excel_row.raw_data == {"origin": "excel-import"}

    assert any(
        "skipping macdent overwrite" in rec.message for rec in caplog.records
    )
