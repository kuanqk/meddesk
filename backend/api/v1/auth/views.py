from django.contrib.auth import authenticate
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.services import get_user_auth_context


class EmailLoginView(APIView):
    """Login by email + password, returns JWT tokens."""

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")

        if not email or not password:
            return Response(
                {"detail": "Email и пароль обязательны."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Неверный email или пароль."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # authenticate using the actual username stored in DB
        authed = authenticate(request, username=user.username, password=password)
        if authed is None:
            return Response(
                {"detail": "Неверный email или пароль."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refresh = RefreshToken.for_user(authed)
        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(get_user_auth_context(request.user))
