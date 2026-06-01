from apps.accounts.permissions import tabs_for_role


def test_superuser_gets_all_tabs():
    tabs = tabs_for_role(None, is_superuser=True)
    assert "schedule" in tabs
    assert "pl" in tabs


def test_doctor_tabs():
    tabs = tabs_for_role("doctor")
    assert tabs == ["schedule", "week"]


def test_owner_tabs():
    tabs = tabs_for_role("owner")
    assert "pl" in tabs
    assert "rooms" in tabs
