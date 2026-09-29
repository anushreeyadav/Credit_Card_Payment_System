"""Authentication API.

The access token is returned in the response body (the frontend keeps it in
memory). The refresh token is only ever sent as an httpOnly cookie scoped to
/api/auth/, so page JavaScript cannot read it.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.utils.decorators import method_decorator
from django.views.decorators.debug import sensitive_post_parameters
from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from config.openapi import THROTTLED, UNAUTHORIZED, error, validation_error

from .serializers import (
    LoginCredentialsSerializer,
    LoginSerializer,
    RegisterSerializer,
    TokenResponseSerializer,
    UserSerializer,
)

REFRESH_COOKIE_PARAM = OpenApiParameter(
    'ccps_refresh', str, OpenApiParameter.COOKIE, required=True,
    description='httpOnly refresh cookie set by login. Browsers and Postman send it automatically.',
)
TOKEN_EXAMPLE = OpenApiExample(
    'Logged in',
    response_only=True,
    value={
        'access': 'eyJhbGciOiJIUzI1NiIs...',
        'user': {'id': 7, 'username': 'priya', 'email': 'priya@example.com', 'first_name': 'Priya',
                 'last_name': 'Sharma', 'is_staff': False, 'date_joined': '2026-09-29T06:00:00Z'},
    },
)

User = get_user_model()

_sensitive = method_decorator(sensitive_post_parameters('password', 'password_confirm'), name='dispatch')


def _cookie():
    return settings.AUTH_REFRESH_COOKIE


def set_refresh_cookie(response, refresh_token):
    cfg = _cookie()
    response.set_cookie(
        cfg['key'],
        refresh_token,
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        path=cfg['path'],
        httponly=cfg['httponly'],
        samesite=cfg['samesite'],
        secure=cfg['secure'],
    )


def clear_refresh_cookie(response):
    cfg = _cookie()
    response.delete_cookie(cfg['key'], path=cfg['path'], samesite=cfg['samesite'])


def check_origin(request):
    """Reject cookie-authenticated calls from origins outside the CORS allow-list.

    Defence in depth on top of SameSite=Strict and JSON-only parsing.
    """
    origin = request.headers.get('Origin')
    if origin and origin not in settings.CORS_ALLOWED_ORIGINS:
        raise PermissionDenied('Origin not allowed.')


class _PublicAuthView:
    # No JWT authentication here: a stale Authorization header must not
    # block logging in, registering or refreshing.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get_authenticate_header(self, request):
        # Without authentication classes DRF would turn auth failures into 403;
        # declaring the scheme keeps "invalid credentials" a proper 401.
        return 'Bearer realm="api"'


@_sensitive
class RegisterView(_PublicAuthView, generics.CreateAPIView):
    """POST /api/auth/register/ - create an account. Does not log the user in."""

    serializer_class = RegisterSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'register'

    @extend_schema(
        tags=['Authentication'],
        summary='Register a new account',
        description='Creates a customer account. Does **not** log in - call Login next. '
        "Usernames and emails are unique (case-insensitive). Passwords must pass Django's "
        'strength rules (8+ characters, not common, not all numbers, not similar to the username).',
        auth=[],
        request=RegisterSerializer,
        responses={
            201: UserSerializer,
            400: validation_error({'email': ['An account with this email already exists.'],
                                   'password': ['This password is too common.']}),
            429: THROTTLED,
        },
        examples=[OpenApiExample('New customer', request_only=True, value={
            'username': 'priya', 'email': 'priya@example.com', 'first_name': 'Priya', 'last_name': 'Sharma',
            'password': 'Str0ng-Pass-2026!', 'password_confirm': 'Str0ng-Pass-2026!'})],
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@_sensitive
class LoginView(_PublicAuthView, APIView):
    """POST /api/auth/login/ - {username, password} -> {access, user} + refresh cookie."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    @extend_schema(
        tags=['Authentication'],
        summary='Log in',
        description='Returns an access token and sets the refresh token as an httpOnly cookie '
        '(`ccps_refresh`, path `/api/auth/`, SameSite=Strict). An email address may be used as the username.',
        auth=[],
        request=LoginCredentialsSerializer,
        responses={
            200: OpenApiResponse(TokenResponseSerializer, description='Logged in. `Set-Cookie: ccps_refresh=...` is also sent.'),
            400: validation_error({'password': ['This field is required.']}),
            401: error('Wrong username/email or password, or the account is inactive.', 'Invalid username or password.'),
            429: THROTTLED,
        },
        examples=[TOKEN_EXAMPLE, OpenApiExample('Credentials', request_only=True,
                                                value={'username': 'priya', 'password': 'Str0ng-Pass-2026!'})],
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tokens = serializer.validated_data
        response = Response({'access': tokens['access'], 'user': UserSerializer(serializer.user).data})
        set_refresh_cookie(response, tokens['refresh'])
        return response


class RefreshView(_PublicAuthView, APIView):
    """POST /api/auth/refresh/ - uses the refresh cookie -> {access, user} + rotated cookie."""

    @extend_schema(
        tags=['Authentication'],
        summary='Refresh the access token',
        description='No request body: the refresh token is read from the `ccps_refresh` cookie. '
        'Returns a new access token and rotates the cookie; the old refresh token stops working.',
        auth=[],
        request=None,
        parameters=[REFRESH_COOKIE_PARAM],
        responses={
            200: TokenResponseSerializer,
            401: error('No refresh cookie, or it is expired, rotated out or blacklisted.', 'Session expired. Please log in again.'),
            403: error('Request came from an origin that is not allowed.', 'Origin not allowed.'),
        },
        examples=[TOKEN_EXAMPLE],
    )
    def post(self, request):
        check_origin(request)
        token = request.COOKIES.get(_cookie()['key'])
        if not token:
            return Response({'detail': 'Not logged in.'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={'refresh': token})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, AuthenticationFailed, ObjectDoesNotExist):
            # Expired/blacklisted token, or the account was deactivated
            # (AuthenticationFailed) or deleted (DoesNotExist - simplejwt looks
            # the user up with .get(), which would otherwise be a 500).
            response = Response({'detail': 'Session expired. Please log in again.'},
                                status=status.HTTP_401_UNAUTHORIZED)
            clear_refresh_cookie(response)
            return response

        access = serializer.validated_data['access']
        user = User.objects.filter(pk=AccessToken(access)['user_id'], is_active=True).first()
        if user is None:
            response = Response({'detail': 'Account unavailable.'}, status=status.HTTP_401_UNAUTHORIZED)
            clear_refresh_cookie(response)
            return response

        response = Response({'access': access, 'user': UserSerializer(user).data})
        set_refresh_cookie(response, serializer.validated_data.get('refresh', token))
        return response


class LogoutView(_PublicAuthView, APIView):
    """POST /api/auth/logout/ - blacklists the refresh token and clears the cookie."""

    @extend_schema(
        tags=['Authentication'],
        summary='Log out',
        description='Blacklists the refresh token from the cookie and clears the cookie. Always 204, even '
        'without a session. Existing access tokens stay valid until they expire (5 minutes).',
        auth=[],
        request=None,
        parameters=[REFRESH_COOKIE_PARAM],
        responses={204: OpenApiResponse(description='Logged out.'),
                   403: error('Request came from an origin that is not allowed.', 'Origin not allowed.')},
    )
    def post(self, request):
        check_origin(request)
        token = request.COOKIES.get(_cookie()['key'])
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass  # already expired or blacklisted
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class MeView(generics.RetrieveAPIView):
    """GET /api/auth/me/ - the current user's profile."""

    serializer_class = UserSerializer

    @extend_schema(tags=['Authentication'], summary='Current user', responses={200: UserSerializer, 401: UNAUTHORIZED})
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_object(self):
        return self.request.user
