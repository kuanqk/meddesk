from apps.accounts.models import ClinicMembership
from apps.accounts.permissions import tabs_for_role


def get_user_auth_context(user) -> dict:
    membership = (
        ClinicMembership.objects.filter(user=user, is_active=True)
        .select_related("clinic")
        .first()
    )

    role = membership.role if membership else None
    if user.is_superuser and not role:
        role = ClinicMembership.Role.OWNER

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_superuser": user.is_superuser,
        "role": role,
        "role_label": membership.get_role_display() if membership else (
            "Владелец" if user.is_superuser else None
        ),
        "clinic_id": membership.clinic_id if membership else None,
        "clinic_name": membership.clinic.name if membership else None,
        "tabs": tabs_for_role(role, is_superuser=user.is_superuser),
    }
