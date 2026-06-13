"""
Unique email on User ([Bug 1], Sprint 3).

User.email is now unique=True, so two users can't share an email. Login looks
the user up with .filter(...).first() — a duplicate email can no longer crash
it with MultipleObjectsReturned (HTTP 500); a missing user is a clean 401.

Note: this project has no public registration endpoint (only login/refresh/me),
so the "duplicate registration via API → 400" case is not applicable here; the
DB-level uniqueness constraint is the guarantee.
"""

import pytest
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from apps.accounts.models import User

LOGIN_URL = "/api/v1/auth/login/"


@pytest.mark.django_db
def test_duplicate_email_raises_integrity_error():
    User.objects.create_user(
        username="alice", email="dup@example.com", password="pass12345"
    )
    # Same email (different username) must violate the unique constraint.
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            User.objects.create_user(
                username="bob", email="dup@example.com", password="pass12345"
            )


@pytest.mark.django_db
def test_login_by_existing_email_succeeds():
    User.objects.create_user(
        username="carol", email="carol@example.com", password="pass12345"
    )
    client = APIClient()
    resp = client.post(
        LOGIN_URL,
        {"email": "carol@example.com", "password": "pass12345"},
        format="json",
    )
    assert resp.status_code == 200
    assert "access" in resp.json()


@pytest.mark.django_db
def test_login_unknown_email_is_401_not_500():
    client = APIClient()
    resp = client.post(
        LOGIN_URL,
        {"email": "nobody@example.com", "password": "whatever"},
        format="json",
    )
    assert resp.status_code == 401
