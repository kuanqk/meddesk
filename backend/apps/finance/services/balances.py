"""Server-side balance chain: balance_end[n-1] → balance_start[n].

Single source of truth for the running-balance math, shared by:
  - DailyReportView.post   — cascade recalc after a day is edited;
  - the propagate_balances management command — health-check / dry-run.

Per account, independently:
  - the earliest day is the anchor (its stored balance_start is kept);
  - each later day: balance_start = previous day's balance_end,
    balance_end = balance_start + Σincome − Σexpense (from its transactions).
Gap days (no DailyReport) are fine: start[cur] == end[prev] because no
operations happen on the missing days.
"""

from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum

from apps.finance.models import DailyBalance, DailyTransaction

ACCOUNTS = ("kaspi_pay", "halyk", "cash")


def opening_for_date(report_date, accounts=ACCOUNTS) -> dict:
    """balance_end of the nearest prior day per account (Decimal), else 0.

    Bridges gap days: an account missing a balance row on the immediately
    preceding day falls back to the most recent day that has one.
    """
    opening = {a: Decimal("0") for a in accounts}
    for account in accounts:
        last_bal = (
            DailyBalance.objects
            .filter(report__date__lt=report_date, account=account)
            .order_by("-report__date")
            .first()
        )
        if last_bal:
            opening[account] = last_bal.balance_end
    return opening


def _day_flow(report, account):
    """Σincome, Σexpense for one report+account (Decimals, 0 when none)."""
    income = (
        DailyTransaction.objects
        .filter(report=report, account=account, direction="income")
        .aggregate(s=Sum("amount"))["s"] or Decimal("0")
    )
    expense = (
        DailyTransaction.objects
        .filter(report=report, account=account, direction="expense")
        .aggregate(s=Sum("amount"))["s"] or Decimal("0")
    )
    return income, expense


def propagate_balances_forward(from_date=None, *, commit=True, accounts=ACCOUNTS) -> list:
    """Recompute the balance chain for days >= from_date (cascade).

    Returns a list of diff dicts for rows whose values changed:
        {account, date, old_start, new_start, old_end, new_end}

    commit=False writes nothing (dry-run); commit=True updates changed rows in
    place. The anchor (earliest day per account) is never rewritten; days
    before from_date are used as chain links but left untouched.
    """
    diffs = []

    for account in accounts:
        rows = list(
            DailyBalance.objects
            .filter(account=account)
            .select_related("report")
            .order_by("report__date")
        )
        prev = None
        for cur in rows:
            # Anchor = first day in the chain.
            if prev is None:
                prev = cur
                continue

            # Days before from_date: leave untouched, but advance prev so the
            # chain stays intact.
            if from_date and cur.report.date < from_date:
                prev = cur
                continue

            new_start = prev.balance_end
            income, expense = _day_flow(cur.report, account)
            new_end = new_start + income - expense

            if new_start != cur.balance_start or new_end != cur.balance_end:
                diffs.append({
                    "account":   account,
                    "date":      cur.report.date,
                    "old_start": cur.balance_start,
                    "new_start": new_start,
                    "old_end":   cur.balance_end,
                    "new_end":   new_end,
                })
                if commit:
                    with db_transaction.atomic():
                        DailyBalance.objects.filter(pk=cur.pk).update(
                            balance_start=new_start,
                            balance_end=new_end,
                        )

            # Refresh the local copy so later iterations chain off the
            # recomputed value (true cascade in both commit and dry-run modes).
            cur.balance_start = new_start
            cur.balance_end = new_end
            prev = cur

    return diffs
