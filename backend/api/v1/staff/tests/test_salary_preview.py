"""
salary-preview endpoint ([C4], Sprint 4).

GET /api/v1/staff/{id}/salary-preview/?revenue=N is owner-only and computes
through the same calculate_doctor_salary service as monthly payroll.
"""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinic, ClinicMembership, User
from apps.staff.models import StaffMember


@pytest.fixture
def clinic(db):
    return Clinic.objects.create(name="Test Clinic", slug="test-clinic")


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


def client_for(clinic, role):
    user = User.objects.create_user(
        username=f"user_{role}", email=f"{role}@example.com", password="pass12345"
    )
    ClinicMembership.objects.create(user=user, clinic=clinic, role=role, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def url(doctor):
    return f"/api/v1/staff/{doctor.id}/salary-preview/"


@pytest.mark.django_db
def test_owner_above_threshold(clinic, doctor):
    resp = client_for(clinic, "owner").get(url(doctor), {"revenue": "5000000"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["staff_id"] == doctor.id
    # 4_500_000*0.30 + 500_000*0.35 = 1_350_000 + 175_000 = 1_525_000
    assert body["below"] == "1350000.00"
    assert body["above"] == "175000.00"
    assert body["salary"] == "1525000.00"


@pytest.mark.django_db
def test_owner_below_threshold(clinic, doctor):
    resp = client_for(clinic, "owner").get(url(doctor), {"revenue": "3000000"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["salary"] == "900000.00"
    assert body["above"] == "0.00"


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["admin", "doctor", "receptionist"])
def test_non_owner_forbidden(clinic, doctor, role):
    resp = client_for(clinic, role).get(url(doctor), {"revenue": "5000000"})
    assert resp.status_code == 403


@pytest.mark.django_db
def test_negative_revenue_rejected(clinic, doctor):
    resp = client_for(clinic, "owner").get(url(doctor), {"revenue": "-1"})
    assert resp.status_code == 400


@pytest.mark.django_db
def test_invalid_revenue_rejected(clinic, doctor):
    resp = client_for(clinic, "owner").get(url(doctor), {"revenue": "abc"})
    assert resp.status_code == 400
