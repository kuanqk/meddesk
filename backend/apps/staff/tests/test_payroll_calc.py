"""
KPI salary formula — single source of truth ([C4], Sprint 4).

calculate_doctor_salary is pure (reads only staff fields). A lightweight stub
stands in for StaffMember so these stay fast and DB-free.
"""

from decimal import Decimal

from apps.staff.services.payroll_calc import calculate_doctor_salary


class _Staff:
    def __init__(self, kpi, below, above):
        self.kpi_threshold = Decimal(kpi)
        self.rate_below_kpi = Decimal(below)
        self.rate_above_kpi = Decimal(above)


# KPI 4_500_000, 30% below, 35% above.
STAFF = _Staff("4500000", "30.00", "35.00")


def test_below_threshold():
    # 3_000_000 < 4_500_000 → all at 30%.
    res = calculate_doctor_salary(STAFF, Decimal("3000000"))
    assert res["below"] == Decimal("900000.00")
    assert res["above"] == Decimal("0.00")
    assert res["total"] == Decimal("900000.00")


def test_exactly_at_threshold():
    # revenue == kpi → still the "below" branch, no "above".
    res = calculate_doctor_salary(STAFF, Decimal("4500000"))
    assert res["below"] == Decimal("1350000.00")  # 4_500_000 * 0.30
    assert res["above"] == Decimal("0.00")
    assert res["total"] == Decimal("1350000.00")


def test_above_threshold():
    # 6_000_000 → 4_500_000*0.30 + 1_500_000*0.35
    res = calculate_doctor_salary(STAFF, Decimal("6000000"))
    assert res["below"] == Decimal("1350000.00")
    assert res["above"] == Decimal("525000.00")
    assert res["total"] == Decimal("1875000.00")


def test_zero_revenue():
    res = calculate_doctor_salary(STAFF, Decimal("0"))
    assert res["total"] == Decimal("0.00")
