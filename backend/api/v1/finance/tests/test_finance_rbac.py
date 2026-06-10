"""
API-level RBAC tests ([C1], Sprint 1).

Verifies that finance / staff endpoints are gated by the same RoleTabAccess
matrix that drives the frontend. With an empty RoleTabAccess table these tests
exercise the hardcoded fallback (apps.accounts.permissions.TAB_ACCESS):

    owner            → schedule, pl, week, rooms, finance   (has finance)
    admin            → schedule, pl, week, rooms            (no finance)
    doctor           → schedule, week                       (no finance)
    anesthesiologist → schedule, week                       (no finance)
    receptionist     → schedule, week, rooms                (no finance)

So only the owner (and superusers) may reach finance endpoints; staff writes
are allowed for owner/admin only.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinic, ClinicMembership, User
from apps.staff.models import StaffMember

ALL_ROLES = ["owner", "admin", "doctor", "anesthesiologist", "receptionist"]

# Roles whose tab set includes "finance" (hardcoded fallback matrix).
FINANCE_ROLES = {"owner"}
# Roles allowed to perform staff write operations.
STAFF_WRITE_ROLES = {"owner", "admin"}


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
def staff_member(clinic):
    return StaffMember.objects.create(
        clinic=clinic, name="Dr. Test", role="doctor"
    )


# ── finance endpoints — gated by the "finance" tab ──────────────────────────

@pytest.mark.django_db
@pytest.mark.parametrize("role", ALL_ROLES)
def test_finance_summary_access(clinic, role):
    client = client_for(clinic, role)
    resp = client.get("/api/v1/finance/summary/?from=2026-06&to=2026-06")
    if role in FINANCE_ROLES:
        assert resp.status_code == 200
    else:
        assert resp.status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("role", ALL_ROLES)
def test_daily_report_post_access(clinic, role):
    client = client_for(clinic, role)
    body = {
        "date": "2026-06-10",
        "transactions": [
            {"account": "cash", "direction": "income", "amount": "1000.00"},
        ],
        "opening_balances": {"cash": "0", "kaspi_pay": "0", "halyk": "0"},
    }
    resp = client.post("/api/v1/finance/daily-report/", body, format="json")
    if role in FINANCE_ROLES:
        assert resp.status_code == 200
    else:
        assert resp.status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("role", ALL_ROLES)
def test_payroll_list_access(clinic, role):
    client = client_for(clinic, role)
    resp = client.get("/api/v1/finance/payroll/?month=2026-06")
    if role in FINANCE_ROLES:
        assert resp.status_code == 200
    else:
        assert resp.status_code == 403


# ── staff write — gated by owner/admin ──────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.parametrize("role", ALL_ROLES)
def test_staff_patch_access(clinic, role, staff_member):
    client = client_for(clinic, role)
    resp = client.patch(
        f"/api/v1/staff/{staff_member.id}/",
        {"name": "Dr. Renamed"},
        format="json",
    )
    if role in STAFF_WRITE_ROLES:
        assert resp.status_code == 200
        staff_member.refresh_from_db()
        assert staff_member.name == "Dr. Renamed"
    else:
        assert resp.status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("role", ALL_ROLES)
def test_staff_list_read_access(clinic, role, staff_member):
    """Reads are allowed for anyone with the schedule OR finance tab (all roles here)."""
    client = client_for(clinic, role)
    resp = client.get("/api/v1/staff/")
    assert resp.status_code == 200


# ── headline acceptance criteria ────────────────────────────────────────────

@pytest.mark.django_db
def test_doctor_forbidden_on_finance_summary(clinic):
    """A doctor gets 403 on GET /api/v1/finance/summary/."""
    client = client_for(clinic, "doctor")
    resp = client.get("/api/v1/finance/summary/?from=2026-06&to=2026-06")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_doctor_forbidden_on_own_rate_patch(clinic, staff_member):
    """A doctor gets 403 trying to PATCH a staff rate."""
    client = client_for(clinic, "doctor")
    resp = client.patch(
        f"/api/v1/staff/{staff_member.id}/",
        {"rate_above_kpi": "99.00"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_superuser_has_finance_access(clinic):
    user = User.objects.create_superuser(
        username="root", email="root@example.com", password="pass12345"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.get("/api/v1/finance/summary/?from=2026-06&to=2026-06")
    assert resp.status_code == 200
