from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"

    def ready(self):
        from django.db.models.signals import post_save, post_delete

        from apps.accounts.models import RoleTabAccess
        from apps.accounts.permissions import _db_tabs_for_role

        def _clear_tab_cache(sender, **kwargs):
            _db_tabs_for_role.cache_clear()

        post_save.connect(_clear_tab_cache, sender=RoleTabAccess)
        post_delete.connect(_clear_tab_cache, sender=RoleTabAccess)
