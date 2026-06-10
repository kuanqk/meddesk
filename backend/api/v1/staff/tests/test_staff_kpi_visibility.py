"""
KPI field visibility / editability on StaffMember ([C1], Sprint 1).

The KPI/payroll-rate fields (kpi_threshold, rate_below_kpi, rate_above_kpi)
drive salary. They must be visible and editable ONLY to the owner:
  - owner GET   → fields present;
  - admin/doctor GET → fields absent;
  - admin PATCH of a KPI field → PermissionDenied (403), DB unchanged;
  - owner PATCH of a KPI field → succeeds, DB updated.
"""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinic, ClinicMembership, User
from apps.staff.models import StaffMember

KPI_FIELDS = ("kpi_threshold", "rate_below_kpi", "rate_above_kpi")


@pytest.fixture
def clinic(db):
    return Clinic.objects.create(name="Test Clinic", slug="test-clinic")


def make_user(clinic, role):
    user = User.objects.create_user(
        username=f"user_{role}",
        email=f"{role}@example.com",
        password="pass12345",
    )
    ClinicMembership.objects.create(
        user=user, clinic=clinic, role=role, is_active=True
    )
    return user


def client_for(clinic, role):
    client = APIClient()
    client.force_authenticate(user=make_user(clinic, role))
    return client


@pytest.fixture
def doctor(clinic):
    return StaffMember.objects.create(
        clinic=clinic,
        name="Dr. House",
        role="doctor",
        kpi_threshold=Decimal("4500000.00"),
        rate_below_kpi=Decimal("30.00"),
        rate_above_kpi=Decimal("35.00"),
    )


# ── read visibility ─────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_owner_sees_kpi_fields(clinic, doctor):
    resp = client_for(clinic, "owner").get(f"/api/v1/staff/{doctor.id}/")
    assert resp.status_code == 200
    body = resp.json()
    for field in KPI_FIELDS:
        assert field in body, f"owner should see {field}"


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["admin", "doctor"])
def test_non_owner_does_not_see_kpi_fields(clinic, doctor, role):
    resp = client_for(clinic, role).get(f"/api/v1/staff/{doctor.id}/")
    assert resp.status_code == 200
    body = resp.json()
    for field in KPI_FIELDS:
        assert field not in body, f"{role} must not see {field}"


# ── write protection ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_admin_cannot_change_kpi(clinic, doctor):
    resp = client_for(clinic, "admin").patch(
        f"/api/v1/staff/{doctor.id}/",
        {"rate_above_kpi": "99.00"},
        format="json",
    )
    assert resp.status_code == 403
    doctor.refresh_from_db()
    assert doctor.rate_above_kpi == Decimal("35.00")


@pytest.mark.django_db
def test_owner_can_change_kpi(clinic, doctor):
    resp = client_for(clinic, "owner").patch(
        f"/api/v1/staff/{doctor.id}/",
        {"rate_above_kpi": "42.00"},
        format="json",
    )
    assert resp.status_code == 200
    doctor.refresh_from_db()
    assert doctor.rate_above_kpi == Decimal("42.00")


@pytest.mark.django_db
def test_admin_can_still_edit_non_kpi_fields(clinic, doctor):
    """Write protection is scoped to KPI fields only — admin can edit name."""
    resp = client_for(clinic, "admin").patch(
        f"/api/v1/staff/{doctor.id}/",
        {"name": "Dr. Renamed"},
        format="json",
    )
    assert resp.status_code == 200
    doctor.refresh_from_db()
    assert doctor.name == "Dr. Renamed"
