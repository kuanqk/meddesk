"""
Server-side balance chain + forward cascade ([C5] part 1, Sprint 5).

Editing a past day must recompute balance_start/balance_end of every later day
(propagate_balances_forward), and the earliest (anchor) day's stored
balance_start must survive edits to its transactions.
"""

from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinic, ClinicMembership, User
from apps.finance.models import DailyBalance

REPORT_URL = "/api/v1/finance/daily-report/"
D1, D2, D3 = "2026-05-01", "2026-05-02", "2026-05-03"


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


def _cash_tx(direction, amount):
    return {"account": "cash", "direction": direction, "amount": amount, "comment": ""}


def _post(client, day, txs):
    body = {"date": day, "transactions": txs, "notes": ""}
    resp = client.post(REPORT_URL, body, format="json")
    assert resp.status_code == 200, resp.content
    return resp


def _bal(day):
    b = DailyBalance.objects.get(report__date=day, account="cash")
    return b.balance_start, b.balance_end


@pytest.mark.django_db
def test_edit_past_day_cascades_forward(owner_client):
    # Build a consistent 3-day chain via the API (in order).
    _post(owner_client, D1, [_cash_tx("income", "100000.00")])   # anchor: 0 → 100000
    _post(owner_client, D2, [_cash_tx("income", "50000.00")])    # 100000 → 150000
    _post(owner_client, D3, [_cash_tx("expense", "30000.00")])   # 150000 → 120000

    assert _bal(D1) == (Decimal("0.00"), Decimal("100000.00"))
    assert _bal(D2) == (Decimal("100000.00"), Decimal("150000.00"))
    assert _bal(D3) == (Decimal("150000.00"), Decimal("120000.00"))

    # Edit day 1: income 100000 → 200000. Days 2 and 3 must cascade.
    _post(owner_client, D1, [_cash_tx("income", "200000.00")])

    assert _bal(D1) == (Decimal("0.00"), Decimal("200000.00"))        # anchor start kept at 0
    assert _bal(D2) == (Decimal("200000.00"), Decimal("250000.00"))   # start = D1.end
    assert _bal(D3) == (Decimal("250000.00"), Decimal("220000.00"))   # start = D2.end


@pytest.mark.django_db
def test_anchor_start_preserved_on_edit(owner_client):
    # Seed the anchor day, then give it a non-zero opening directly in the DB
    # (as a real anchor would have from historical import).
    _post(owner_client, D1, [_cash_tx("income", "100000.00")])
    DailyBalance.objects.filter(report__date=D1, account="cash").update(
        balance_start=Decimal("5000.00"), balance_end=Decimal("105000.00")
    )

    # Re-save the anchor's transactions — its stored start must NOT be zeroed.
    _post(owner_client, D1, [_cash_tx("income", "120000.00")])

    start, end = _bal(D1)
    assert start == Decimal("5000.00")          # anchor opening preserved
    assert end == Decimal("125000.00")          # 5000 + 120000
