"""
Refresh-token blacklisting after rotation ([Bug 11], Sprint 3).

With ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION, refreshing issues a new
refresh token and blacklists the old one. Reusing the old refresh token must be
rejected (401) — a stolen/rotated token is dead immediately.

Note: there is no logout endpoint in this project (only login/refresh/me), so
no explicit token.blacklist() call site exists to test; rotation is the
blacklisting trigger.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User

LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="dave", email="dave@example.com", password="pass12345"
    )


@pytest.mark.django_db
def test_old_refresh_token_rejected_after_rotation(user):
    client = APIClient()

    # 1. Log in → initial refresh token.
    login = client.post(
        LOGIN_URL,
        {"email": "dave@example.com", "password": "pass12345"},
        format="json",
    )
    assert login.status_code == 200
    old_refresh = login.json()["refresh"]

    # 2. Rotate: exchange the refresh token for a new pair. The old token is
    #    now blacklisted.
    rotated = client.post(REFRESH_URL, {"refresh": old_refresh}, format="json")
    assert rotated.status_code == 200
    new_refresh = rotated.json()["refresh"]
    assert new_refresh != old_refresh

    # 3. Reusing the OLD refresh token must be rejected.
    reused = client.post(REFRESH_URL, {"refresh": old_refresh}, format="json")
    assert reused.status_code == 401

    # 4. The freshly issued token still works.
    ok = client.post(REFRESH_URL, {"refresh": new_refresh}, format="json")
    assert ok.status_code == 200
