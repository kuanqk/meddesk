"""
Reopen + resave of an imported day must not duplicate transactions ([C3], Sprint 3).

Imported rows (source="excel"/"macdent") are preserved across a POST; only
manual rows are replaced. The closing balance is recomputed from ALL rows
(manual + imported), so resaving without adding manual rows leaves balance_end
unchanged and creates no duplicates.
"""

from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Clinic, ClinicMembership, User
from apps.finance.models import DailyBalance, DailyReport, DailyTransaction

REPORT_URL = "/api/v1/finance/daily-report/"
DAY = "2026-05-02"
DAY_DATE = date(2026, 5, 2)


@pytest.fixture
def clinic(db):
    return Clinic.objects.create(name="Test Clinic", slug="test-clinic")


@pytest.fixture
def owner_client(clinic):
    user = User.objects.create_user(
        username="owner", email="owner@example.com", password="pass12345"
    )
    ClinicMembership.objects.create(
        user=user, clinic=clinic, role="owner", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def imported_report(db):
    """A day imported from Excel: 3 excel transactions on cash + a balance row.

    cash: +100000 income, -30000 expense, +20000 income  →  net +90000
    opening 0 → balance_end 90000.
    """
    report = DailyReport.objects.create(date=DAY_DATE)
    rows = [
        ("income", "100000.00", "Оплата пациента"),
        ("expense", "30000.00", "Закупка материалов"),
        ("income", "20000.00", "Доплата"),
    ]
    for i, (direction, amount, comment) in enumerate(rows):
        DailyTransaction.objects.create(
            report=report,
            account="cash",
            direction=direction,
            amount=Decimal(amount),
            comment=comment,
            row_order=i,
            source="excel",
        )
    DailyBalance.objects.create(
        report=report,
        account="cash",
        balance_start=Decimal("0"),
        balance_end=Decimal("90000.00"),
    )
    return report


def _cash_balance_end() -> Decimal:
    return DailyBalance.objects.get(report__date=DAY_DATE, account="cash").balance_end


# ── GET exposes source ───────────────────────────────────────────────────────

@pytest.mark.django_db
def test_get_exposes_source(owner_client, imported_report):
    resp = owner_client.get(REPORT_URL, {"date": DAY})
    assert resp.status_code == 200
    body = resp.json()
    txs = body["transactions"]
    assert len(txs) == 3
    assert all("source" in t for t in txs)
    assert all(t["source"] == "excel" for t in txs)


# ── resave with no manual rows → no duplication, balance unchanged ───────────

@pytest.mark.django_db
def test_resave_empty_preserves_excel_and_balance(owner_client, imported_report):
    payload = {
        "date": DAY,
        "transactions": [],
        "opening_balances": {"kaspi_pay": "0", "halyk": "0", "cash": "0"},
        "notes": "",
    }
    resp = owner_client.post(REPORT_URL, payload, format="json")
    assert resp.status_code == 200

    # Excel rows untouched, no duplicates created.
    excel_qs = DailyTransaction.objects.filter(report__date=DAY_DATE, source="excel")
    assert excel_qs.count() == 3
    assert DailyTransaction.objects.filter(report__date=DAY_DATE).count() == 3

    # balance_end recomputed from the preserved excel rows → unchanged.
    assert _cash_balance_end() == Decimal("90000.00")


@pytest.mark.django_db
def test_repeated_resave_does_not_accumulate(owner_client, imported_report):
    payload = {
        "date": DAY,
        "transactions": [],
        "opening_balances": {"kaspi_pay": "0", "halyk": "0", "cash": "0"},
        "notes": "",
    }
    for _ in range(3):
        resp = owner_client.post(REPORT_URL, payload, format="json")
        assert resp.status_code == 200

    assert DailyTransaction.objects.filter(report__date=DAY_DATE).count() == 3
    assert _cash_balance_end() == Decimal("90000.00")


# ── resave with one manual row → excel preserved + manual added ──────────────

@pytest.mark.django_db
def test_resave_with_manual_row_keeps_excel_and_updates_balance(owner_client, imported_report):
    payload = {
        "date": DAY,
        "transactions": [
            {"account": "cash", "direction": "income", "amount": "5000.00", "comment": "Ручная доплата"},
        ],
        "opening_balances": {"kaspi_pay": "0", "halyk": "0", "cash": "0"},
        "notes": "",
    }
    resp = owner_client.post(REPORT_URL, payload, format="json")
    assert resp.status_code == 200

    assert DailyTransaction.objects.filter(report__date=DAY_DATE, source="excel").count() == 3
    manual_qs = DailyTransaction.objects.filter(report__date=DAY_DATE, source="manual")
    assert manual_qs.count() == 1
    assert manual_qs.first().amount == Decimal("5000.00")

    # balance_end accounts for both excel (90000) and the new manual (+5000).
    assert _cash_balance_end() == Decimal("95000.00")

    # The manual row is sent back as source="manual" on GET.
    body = resp.json()
    assert any(t["source"] == "manual" for t in body["transactions"])
