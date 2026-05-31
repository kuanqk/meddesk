from apps.accounts.models import Clinic
from apps.schedule.scheduler_state import SchedulerState

DEFAULT_CLINIC_SLUG = "default"


def get_default_clinic() -> Clinic:
    clinic, _ = Clinic.objects.get_or_create(
        slug=DEFAULT_CLINIC_SLUG,
        defaults={"name": "Стоматологическая клиника"},
    )
    return clinic


def load_scheduler_state() -> dict | None:
    clinic = get_default_clinic()
    try:
        return clinic.scheduler_state.data
    except SchedulerState.DoesNotExist:
        return None


def save_scheduler_state(data: dict) -> SchedulerState:
    clinic = get_default_clinic()
    state, _ = SchedulerState.objects.update_or_create(
        clinic=clinic,
        defaults={"data": data},
    )
    return state
