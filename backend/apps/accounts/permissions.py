"""Role-based tab access. Extend TAB_ACCESS when adding new sections."""

TAB_SCHEDULE = "schedule"
TAB_PL = "pl"
TAB_WEEK = "week"
TAB_ROOMS = "rooms"

ALL_TABS = (TAB_SCHEDULE, TAB_PL, TAB_WEEK, TAB_ROOMS)

TAB_ACCESS: dict[str, tuple[str, ...]] = {
    "owner": ALL_TABS,
    "admin": ALL_TABS,
    "doctor": (TAB_SCHEDULE, TAB_WEEK),
    "anesthesiologist": (TAB_SCHEDULE, TAB_WEEK),
    "receptionist": (TAB_SCHEDULE, TAB_WEEK, TAB_ROOMS),
}

DEFAULT_TABS = (TAB_SCHEDULE,)


def tabs_for_role(role: str | None, *, is_superuser: bool = False) -> list[str]:
    if is_superuser:
        return list(ALL_TABS)
    if role and role in TAB_ACCESS:
        return list(TAB_ACCESS[role])
    return list(DEFAULT_TABS)
