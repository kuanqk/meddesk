"""Single source of truth for the KPI-based doctor salary formula.

Used by both FinanceSyncService.calculate_payroll (monthly ФОТ) and the
salary-preview endpoint, so the numbers can never drift between the two.
"""

from decimal import Decimal

CENTS = Decimal("0.01")


def calculate_doctor_salary(staff, revenue: Decimal) -> dict:
    """Return {"below", "above", "total"} for a doctor's KPI payroll.

    Below the KPI threshold the whole revenue is paid at rate_below_kpi;
    above it, the threshold portion is paid at rate_below_kpi and the excess
    at rate_above_kpi. Pure: reads only fields off `staff`, touches no DB.
    """
    revenue = Decimal(revenue)
    kpi = staff.kpi_threshold
    rate_b = staff.rate_below_kpi / Decimal("100")
    rate_a = staff.rate_above_kpi / Decimal("100")

    if revenue <= kpi:
        below = revenue * rate_b
        above = Decimal("0")
    else:
        below = kpi * rate_b
        above = (revenue - kpi) * rate_a

    below = below.quantize(CENTS)
    above = above.quantize(CENTS)
    total = (below + above).quantize(CENTS)
    return {"below": below, "above": above, "total": total}
