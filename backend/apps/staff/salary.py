"""Salary calculation for staff members."""

from decimal import Decimal


def calculate_salary(
    hours: Decimal,
    revenue: Decimal,
    base_rate: Decimal,
    elevated_rate: Decimal,
    revenue_threshold: Decimal,
    implant_cost: Decimal = Decimal("0"),
    lab_cost: Decimal = Decimal("0"),
    deduct_implant: bool = False,
    deduct_lab: bool = False,
) -> Decimal:
    """
    Calculate staff salary based on hours worked and revenue.

    If revenue exceeds threshold, elevated_rate applies to all hours.
    Optional deductions reduce the revenue base before threshold comparison.
    """
    adjusted_revenue = revenue
    if deduct_implant:
        adjusted_revenue -= implant_cost
    if deduct_lab:
        adjusted_revenue -= lab_cost

    rate = elevated_rate if adjusted_revenue >= revenue_threshold else base_rate
    return (hours * rate).quantize(Decimal("0.01"))
