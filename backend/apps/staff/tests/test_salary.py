from decimal import Decimal

from apps.staff.salary import calculate_salary


def test_calculate_salary_base_rate():
    result = calculate_salary(
        hours=Decimal("10"),
        revenue=Decimal("50000"),
        base_rate=Decimal("5000"),
        elevated_rate=Decimal("7000"),
        revenue_threshold=Decimal("100000"),
    )
    assert result == Decimal("50000.00")


def test_calculate_salary_elevated_rate():
    result = calculate_salary(
        hours=Decimal("10"),
        revenue=Decimal("150000"),
        base_rate=Decimal("5000"),
        elevated_rate=Decimal("7000"),
        revenue_threshold=Decimal("100000"),
    )
    assert result == Decimal("70000.00")


def test_calculate_salary_with_deductions():
    result = calculate_salary(
        hours=Decimal("8"),
        revenue=Decimal("120000"),
        base_rate=Decimal("5000"),
        elevated_rate=Decimal("7000"),
        revenue_threshold=Decimal("100000"),
        implant_cost=Decimal("30000"),
        deduct_implant=True,
    )
    assert result == Decimal("40000.00")
