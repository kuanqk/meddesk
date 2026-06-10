"""
Login throttling ([Bug 10], Sprint 2).

EmailLoginView is rate-limited to 10 requests/min per IP via
ScopedRateThrottle(scope="login"). The 11th request within the window must
return 429. Other endpoints carry no throttle_scope, so they are unaffected.

ScopedRateThrottle keeps counters in Django cache; clear it between tests so
counts don't leak.
"""

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User

LOGIN_URL = "/api/v1/auth/login/"


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_eleventh_login_attempt_is_throttled():
    client = APIClient()
    body = {"email": "nobody@example.com", "password": "wrong"}

    # First 10 attempts go through to the view (rejected creds → 401).
    for i in range(10):
        resp = client.post(LOGIN_URL, body, format="json")
        assert resp.status_code in (400, 401), f"attempt {i + 1}: {resp.status_code}"

    # 11th attempt is blocked by the throttle.
    resp = client.post(LOGIN_URL, body, format="json")
    assert resp.status_code == 429


@pytest.mark.django_db
def test_valid_login_within_limit_succeeds():
    user = User.objects.create_user(
        username="alice", email="alice@example.com", password="pass12345"
    )

    client = APIClient()
    resp = client.post(
        LOGIN_URL,
        {"email": "alice@example.com", "password": "pass12345"},
        format="json",
    )
    assert resp.status_code == 200
    assert "access" in resp.json()
    assert "refresh" in resp.json()
