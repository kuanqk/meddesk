from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ClinicMembership, RoleTabAccess
from apps.accounts.permissions import ALL_AVAILABLE_TABS, TAB_ACCESS

ROLE_LABELS = {
    "owner":            "Владелец",
    "admin":            "Администратор",
    "doctor":           "Врач",
    "anesthesiologist": "Анестезиолог",
    "receptionist":     "Регистратор",
}

# Roles shown in the settings UI (owner is shown but always locked)
MANAGED_ROLES = ["owner", "admin", "doctor", "anesthesiologist", "receptionist"]


def _is_owner(user) -> bool:
    if user.is_superuser:
        return True
    return ClinicMembership.objects.filter(
        user=user, role=ClinicMembership.Role.OWNER, is_active=True
    ).exists()


def _current_tabs(role: str) -> list[str]:
    try:
        return list(RoleTabAccess.objects.get(role=role).tabs)
    except RoleTabAccess.DoesNotExist:
        return list(TAB_ACCESS.get(role, []))


class TabsListView(APIView):
    """GET /api/v1/settings/tabs/ — all available tab definitions."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ALL_AVAILABLE_TABS)


class PermissionsView(APIView):
    """
    GET  /api/v1/settings/permissions/ — current role→tabs matrix
    PUT  /api/v1/settings/permissions/ — update matrix (owner only)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = [
            {
                "role":       role,
                "role_label": ROLE_LABELS.get(role, role),
                "tabs":       _current_tabs(role),
            }
            for role in MANAGED_ROLES
        ]
        return Response(data)

    def put(self, request):
        if not _is_owner(request.user):
            return Response({"error": "Только владелец может изменять права доступа."}, status=403)

        payload = request.data  # expected: [{role, tabs}, ...]
        if not isinstance(payload, list):
            return Response({"error": "Expected a list of {role, tabs} objects."}, status=400)

        valid_tab_ids = {t["id"] for t in ALL_AVAILABLE_TABS}
        updated = []

        for item in payload:
            role = item.get("role", "").strip()
            tabs = item.get("tabs", [])

            if role not in MANAGED_ROLES:
                continue
            if role == "owner":
                # Owner always keeps all tabs — ignore payload
                continue
            if not isinstance(tabs, list):
                return Response({"error": f"tabs for {role} must be a list."}, status=400)

            # Validate tab ids
            unknown = [t for t in tabs if t not in valid_tab_ids]
            if unknown:
                return Response({"error": f"Unknown tab ids: {unknown}"}, status=400)

            RoleTabAccess.objects.update_or_create(
                role=role,
                defaults={"tabs": tabs},
            )
            updated.append(role)

        # Return the full updated matrix
        data = [
            {
                "role":       role,
                "role_label": ROLE_LABELS.get(role, role),
                "tabs":       _current_tabs(role),
            }
            for role in MANAGED_ROLES
        ]
        return Response(data)
