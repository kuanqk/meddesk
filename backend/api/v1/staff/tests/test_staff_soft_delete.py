"""
Soft-delete of StaffMember ([C6], Sprint 1).

DELETE /api/v1/staff/{id}/ must NOT physically remove the row — it flips
is_active to False so the member disappears from listings while the financial
history (DoctorRevenue, PayrollCalculation) stays intact. The FKs are also
PROTECT, so a direct DB delete with related rows raises ProtectedError.
"""

from datetime import date
from decimal import Decimal

import pytest
from django.db.models import ProtectedError
from rest_framework.test import APIClient

from apps.accounts.models import Clinic, ClinicMembership, User
from apps.finance.models import DoctorRevenue, PayrollCalculation
from apps.staff.models import StaffMember


@pytest.fixture
def clinic(db):
    return Clinic.objects.create(name="Test Clinic", slug="test-clinic")


@pytest.fixture
def owner(clinic):
    user = User.objects.create_user(
        username="owner", email="owner@example.com", password="pass12345"
    )
    ClinicMembership.objects.create(
        user=user, clinic=clinic, role="owner", is_active=True
    )
    return user


@pytest.fixture
def doctor(clinic):
    return StaffMember.objects.create(
        clinic=clinic, name="Dr. House", role="doctor"
    )


@pytest.fixture
def revenue(doctor):
    return DoctorRevenue.objects.create(
        doctor=doctor,
        date=date(2026, 6, 1),
        revenue=Decimal("500000.00"),
        hours_worked=Decimal("8.00"),
        source="manual",
    )


@pytest.fixture
def payroll(doctor):
    return PayrollCalculation.objects.create(
        staff_member=doctor,
        period=date(2026, 6, 1),
        revenue_total=Decimal("500000.00"),
        kpi_threshold=Decimal("4500000.00"),
        rate_below_kpi=Decimal("30.00"),
        rate_above_kpi=Decimal("35.00"),
        amount_below_kpi=Decimal("150000.00"),
        amount_above_kpi=Decimal("0.00"),
        payroll_total=Decimal("150000.00"),
    )


@pytest.fixture
def client(owner):
    c = APIClient()
    c.force_authenticate(user=owner)
    return c


@pytest.mark.django_db
def test_delete_is_soft(client, doctor):
    """DELETE returns 204, flips is_active, keeps the row in the DB."""
    resp = client.delete(f"/api/v1/staff/{doctor.id}/")
    assert resp.status_code == 204

    doctor.refresh_from_db()
    assert doctor.is_active is False
    assert StaffMember.objects.filter(pk=doctor.id).exists() is True


@pytest.mark.django_db
def test_delete_preserves_financial_history(client, doctor, revenue, payroll):
    """Soft-delete must not touch DoctorRevenue / PayrollCalculation rows."""
    resp = client.delete(f"/api/v1/staff/{doctor.id}/")
    assert resp.status_code == 204

    assert DoctorRevenue.objects.filter(pk=revenue.id).exists() is True
    assert PayrollCalculation.objects.filter(pk=payroll.id).exists() is True
    # The financial figures are unchanged.
    revenue.refresh_from_db()
    assert revenue.revenue == Decimal("500000.00")


@pytest.mark.django_db
def test_soft_deleted_member_hidden_from_list(client, doctor):
    """After soft-delete the member no longer appears in GET /staff/."""
    client.delete(f"/api/v1/staff/{doctor.id}/")

    resp = client.get("/api/v1/staff/")
    assert resp.status_code == 200
    payload = resp.json()
    rows = payload["results"] if isinstance(payload, dict) else payload
    ids = [row["id"] for row in rows]
    assert doctor.id not in ids


@pytest.mark.django_db
def test_direct_delete_is_protected(doctor, revenue):
    """A physical .delete() with related revenue rows raises ProtectedError."""
    with pytest.raises(ProtectedError):
        StaffMember.objects.get(pk=doctor.id).delete()

    # Nothing was removed.
    assert StaffMember.objects.filter(pk=doctor.id).exists() is True
    assert DoctorRevenue.objects.filter(pk=revenue.id).exists() is True
