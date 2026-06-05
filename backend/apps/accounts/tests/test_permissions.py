"""
Tests for tabs_for_role().

The function tries the DB first, then falls back to hardcoded defaults.
These tests exercise the hardcoded fallback path (no DB available in unit tests).
"""

from unittest.mock import patch

from apps.accounts.permissions import tabs_for_role


def _with_db_unavailable(fn):
    """Decorator: patch _db_tabs_for_role to always raise so fallback is tested."""
    def wrapper(*args, **kwargs):
        with patch("apps.accounts.permissions._db_tabs_for_role", side_effect=Exception("no db")):
            return fn(*args, **kwargs)
    return wrapper


@_with_db_unavailable
def test_superuser_gets_all_tabs():
    tabs = tabs_for_role(None, is_superuser=True)
    assert "schedule" in tabs
    assert "pl" in tabs
    assert "finance" in tabs


@_with_db_unavailable
def test_doctor_tabs():
    tabs = tabs_for_role("doctor")
    assert tabs == ["schedule", "week"]


@_with_db_unavailable
def test_owner_tabs():
    tabs = tabs_for_role("owner")
    assert "pl" in tabs
    assert "rooms" in tabs
    assert "finance" in tabs


@_with_db_unavailable
def test_unknown_role_returns_default():
    tabs = tabs_for_role("unknown_role")
    assert tabs == ["schedule"]


@_with_db_unavailable
def test_none_role_returns_default():
    tabs = tabs_for_role(None)
    assert tabs == ["schedule"]
