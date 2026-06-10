"""
MacDent revenue aggregation ([C2], Sprint 2).

Many payments for the same doctor on the same day must aggregate into ONE
DoctorRevenue row: revenue = sum of all payments, patients_count = number of
payments. The old code overwrote the row per payment, keeping only the last.
"""

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
    """Run sync_period with the MacDent client fully mocked (no network)."""
    with patch("apps.finance.services.sync.MacDentClient") as MockClient:
        MockClient.return_value.get_payments.return_value = payments
        return FinanceSyncService().sync_period(dfrom, dto)


@pytest.mark.django_db
def test_six_payments_aggregate_into_one_row(doctor):
    from datetime import date

    payments = [
        {"doctor": "777", "date": "01.06.2026", "summ": 50000}
        for _ in range(6)
    ]

    saved = run_sync(payments, date(2026, 6, 1), date(2026, 6, 1))

    # one aggregated group written
    assert saved == 1
    rows = DoctorRevenue.objects.filter(doctor=doctor, date=date(2026, 6, 1))
    assert rows.count() == 1

    row = rows.first()
    assert row.revenue == Decimal("300000")
    assert row.patients_count == 6
    assert row.source == "macdent"
    assert isinstance(row.raw_data, list)
    assert len(row.raw_data) == 6
