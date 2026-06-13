"""
Client opening_balances is ignored ([C5] part 1, Sprint 5).

The server derives balance_start from the previous day's balance_end. A bogus
opening_balances in the POST body must not affect the stored balance_start.
"""

from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinic, ClinicMembership, User
from apps.finance.models import DailyBalance

REPORT_URL = "/api/v1/finance/daily-report/"
D1, D2 = "2026-05-01", "2026-05-02"


@pytest.fixture
def clinic(db):
    return Clinic.objects.create(name="Test Clinic", slug="test-clinic")


@pytest.fixture
def owner_client(clinic):
    user = User.objects.create_user(
        username="owner", email="owner@example.com", password="pass12345"
    )
    ClinicMembership.objects.create(user=user, clinic=clinic, role="owner", is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_client_opening_is_ignored(owner_client):
    # Day 1 anchor → end 100000.
    owner_client.post(
        REPORT_URL,
        {"date": D1, "transactions": [
            {"account": "cash", "direction": "income", "amount": "100000.00", "comment": ""}],
         "notes": ""},
        format="json",
    )

    # Day 2 with a deliberately wrong opening for every account.
    resp = owner_client.post(
        REPORT_URL,
        {
            "date": D2,
            "transactions": [
                {"account": "cash", "direction": "income", "amount": "50000.00", "comment": ""}],
            "opening_balances": {"cash": "999999.00", "kaspi_pay": "888888.00", "halyk": "777777.00"},
            "notes": "",
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content

    cash = DailyBalance.objects.get(report__date=D2, account="cash")
    # start = day1 end (100000), NOT the bogus 999999.
    assert cash.balance_start == Decimal("100000.00")
    assert cash.balance_end == Decimal("150000.00")

    # Accounts with no prior day are anchors → start stays 0, not the bogus value.
    kaspi = DailyBalance.objects.get(report__date=D2, account="kaspi_pay")
    assert kaspi.balance_start == Decimal("0.00")

    # And the GET response reflects the server-derived opening, not the payload.
    got = owner_client.get(REPORT_URL, {"date": D2}).json()
    assert got["opening_balances"]["cash"] == "100000.00"
