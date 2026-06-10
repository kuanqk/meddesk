"""
Role-based tab access.

Tabs are stored in DB (RoleTabAccess). The hardcoded TAB_ACCESS dict is used
as a fallback when no DB record exists for a role, and as the seed for
the init_permissions management command.

Add new tabs to ALL_AVAILABLE_TABS — they automatically appear in the
settings UI without any frontend changes.
"""

from functools import lru_cache

from rest_framework.permissions import BasePermission

TAB_SCHEDULE = "schedule"
TAB_PL = "pl"
TAB_WEEK = "week"
TAB_ROOMS = "rooms"
TAB_FINANCE = "finance"

ALL_TABS = (TAB_SCHEDULE, TAB_PL, TAB_WEEK, TAB_ROOMS, TAB_FINANCE)

# Shown in the settings UI — order matters (left-to-right columns)
ALL_AVAILABLE_TABS = [
    {"id": TAB_SCHEDULE, "label": "📅 Расписание"},
    {"id": TAB_PL,       "label": "💰 P&L"},
    {"id": TAB_WEEK,     "label": "📆 По дням"},
    {"id": TAB_ROOMS,    "label": "🏥 Кабинеты"},
    {"id": TAB_FINANCE,  "label": "📊 Финансы"},
]

# Hardcoded defaults — used as fallback and seed
TAB_ACCESS: dict[str, tuple[str, ...]] = {
    "owner":             ALL_TABS,
    "admin":             (TAB_SCHEDULE, TAB_PL, TAB_WEEK, TAB_ROOMS),
    "doctor":            (TAB_SCHEDULE, TAB_WEEK),
    "anesthesiologist":  (TAB_SCHEDULE, TAB_WEEK),
    "receptionist":      (TAB_SCHEDULE, TAB_WEEK, TAB_ROOMS),
}

DEFAULT_TABS = (TAB_SCHEDULE,)


@lru_cache(maxsize=32)
def _db_tabs_for_role(role: str) -> list[str] | None:
    """
    Returns the tab list from DB, or None if no record exists.
    Result is cached per role; cache is cleared by a post_save signal
    on RoleTabAccess (wired up in AccountsConfig.ready).
    """
    # Late import to avoid Django "apps not ready" errors at module load time.
    from apps.accounts.models import RoleTabAccess  # noqa: PLC0415
    try:
        return list(RoleTabAccess.objects.get(role=role).tabs)
    except RoleTabAccess.DoesNotExist:
        return None


def tabs_for_role(role: str | None, *, is_superuser: bool = False) -> list[str]:
    if is_superuser:
        return list(ALL_TABS)
    if not role:
        return list(DEFAULT_TABS)

    # 1. DB overrides
    try:
        db_tabs = _db_tabs_for_role(role)
        if db_tabs is not None:
            return db_tabs
    except Exception:
        # If DB isn't available (e.g. tests without migrations), fall through
        pass

    # 2. Hardcoded fallback
    return list(TAB_ACCESS.get(role, DEFAULT_TABS))


# ── user-level helpers ─────────────────────────────────────────────────────────
#
# A user's effective tabs/role are derived from their active ClinicMembership
# rows. The same RoleTabAccess matrix drives both the frontend (via /auth/me/)
# and the API-level RBAC permission classes below.


def _active_roles(user) -> set[str]:
    """Distinct active membership roles for a user."""
    # Late import to avoid Django "apps not ready" errors at module load time.
    from apps.accounts.models import ClinicMembership  # noqa: PLC0415

    return set(
        ClinicMembership.objects
        .filter(user=user, is_active=True)
        .values_list("role", flat=True)
    )


def user_tabs(user) -> list[str]:
    """
    Effective tabs for a user: union of tabs_for_role over all active roles.
    Superusers get every tab.
    """
    if getattr(user, "is_superuser", False):
        return list(ALL_TABS)

    tabs: list[str] = []
    seen: set[str] = set()
    for role in _active_roles(user):
        for tab in tabs_for_role(role):
            if tab not in seen:
                seen.add(tab)
                tabs.append(tab)
    return tabs


def is_owner(user) -> bool:
    if getattr(user, "is_superuser", False):
        return True
    from apps.accounts.models import ClinicMembership  # noqa: PLC0415

    return ClinicMembership.objects.filter(
        user=user, role=ClinicMembership.Role.OWNER, is_active=True
    ).exists()


def is_owner_or_admin(user) -> bool:
    if getattr(user, "is_superuser", False):
        return True
    from apps.accounts.models import ClinicMembership  # noqa: PLC0415

    return ClinicMembership.objects.filter(
        user=user,
        role__in=[ClinicMembership.Role.OWNER, ClinicMembership.Role.ADMIN],
        is_active=True,
    ).exists()


# ── DRF permission classes ───────────────────────────────────────────────────


class RoleTabPermission(BasePermission):
    """Grants access only if `required_tab` is in the user's effective tabs."""

    required_tab: str = ""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return self.required_tab in user_tabs(user)


def require_tab(tab: str):
    """Factory: build a RoleTabPermission subclass bound to `tab`."""
    return type(f"Req_{tab}", (RoleTabPermission,), {"required_tab": tab})


class IsOwnerOrAdmin(BasePermission):
    """Write access restricted to owner/admin roles (and superusers)."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return is_owner_or_admin(user)
