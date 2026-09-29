from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

User = get_user_model()

REGISTER = '/api/auth/register/'
LOGIN = '/api/auth/login/'
REFRESH = '/api/auth/refresh/'
LOGOUT = '/api/auth/logout/'
ME = '/api/auth/me/'
COOKIE = settings.AUTH_REFRESH_COOKIE['key']
PASSWORD = 'Str0ng-Pass-2026!'


class AuthTestBase(APITestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters between tests

    def register(self, **overrides):
        data = {
            'username': 'alice', 'email': 'alice@example.com', 'first_name': 'Alice', 'last_name': 'Smith',
            'password': PASSWORD, 'password_confirm': PASSWORD,
        }
        data.update(overrides)
        return self.client.post(REGISTER, data, format='json')

    def login(self, username='alice', password=PASSWORD):
        return self.client.post(LOGIN, {'username': username, 'password': password}, format='json')


class RegisterTests(AuthTestBase):
    def test_successful_registration(self):
        response = self.register()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['username'], 'alice')
        self.assertEqual(response.data['email'], 'alice@example.com')
        self.assertFalse(response.data['is_staff'])
        for field in ('password', 'password_confirm', 'access', 'refresh'):
            self.assertNotIn(field, response.data)
        self.assertNotIn(COOKIE, response.cookies)  # registering does not log in
        user = User.objects.get(username='alice')
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)

    def test_email_is_normalised(self):
        self.register(email='  Alice@Example.COM ')
        self.assertEqual(User.objects.get().email, 'alice@example.com')

    def test_duplicate_username_rejected(self):
        self.register()
        response = self.register(username='ALICE', email='other@example.com')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['username'], ['A user with that username already exists.'])

    def test_duplicate_email_rejected(self):
        self.register()
        response = self.register(username='alice2', email='ALICE@example.com')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['email'], ['An account with this email already exists.'])

    def test_validation_errors(self):
        cases = {
            'missing username': ({'username': ''}, 'username'),
            'bad username': ({'username': 'bad name!'}, 'username'),
            'missing email': ({'email': ''}, 'email'),
            'bad email': ({'email': 'not-an-email'}, 'email'),
            'mismatch': ({'password_confirm': 'Different-Pass-1'}, 'password_confirm'),
            'too short': ({'password': 'Ab1!', 'password_confirm': 'Ab1!'}, 'password'),
            'too common': ({'password': 'password123', 'password_confirm': 'password123'}, 'password'),
            'all numeric': ({'password': '8392017465', 'password_confirm': '8392017465'}, 'password'),
            'like username': ({'password': 'alice2026', 'password_confirm': 'alice2026'}, 'password'),
        }
        for label, (overrides, field) in cases.items():
            with self.subTest(label):
                response = self.register(**overrides)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)
        self.assertFalse(User.objects.exists())

    def test_password_never_echoed_in_errors(self):
        response = self.register(password='password123', password_confirm='password123')
        self.assertNotIn('password123', response.content.decode())


class LoginTests(AuthTestBase):
    def setUp(self):
        super().setUp()
        self.register()

    def test_login_returns_access_and_sets_httponly_cookie(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], 'alice')
        self.assertNotIn('refresh', response.data)
        AccessToken(response.data['access'])  # valid access token

        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Strict')
        self.assertEqual(cookie['path'], '/api/auth/')
        self.assertEqual(int(cookie['max-age']), int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()))
        RefreshToken(cookie.value)  # valid refresh token

    def test_login_with_email(self):
        response = self.login(username='ALICE@example.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], 'alice')

    def test_invalid_credentials(self):
        for username, password in [('alice', 'Wrong-Pass-1'), ('nobody', PASSWORD), ('nobody@example.com', PASSWORD)]:
            with self.subTest(username=username):
                response = self.login(username, password)
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
                self.assertEqual(response.data['detail'], 'Invalid username or password.')
                self.assertNotIn(COOKIE, response.cookies)

    def test_inactive_user_cannot_log_in(self):
        User.objects.filter(username='alice').update(is_active=False)
        self.assertEqual(self.login().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_fields(self):
        response = self.client.post(LOGIN, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertIn('password', response.data)

    def test_stale_authorization_header_does_not_block_login(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer expired.or.garbage')
        self.assertEqual(self.login().status_code, status.HTTP_200_OK)

    def test_login_is_throttled(self):
        codes = [self.login(password='Wrong-Pass-1').status_code for _ in range(11)]
        self.assertEqual(codes[-1], status.HTTP_429_TOO_MANY_REQUESTS)


class SessionTests(AuthTestBase):
    def setUp(self):
        super().setUp()
        self.register()
        self.access = self.login().data['access']

    def test_me_with_access_token(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access}')
        response = self.client.get(ME)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'alice')

    def test_unauthorized_requests(self):
        self.assertEqual(self.client.get(ME).status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertEqual(self.client.get(ME).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get('/api/cards/').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_expired_access_token_rejected(self):
        token = AccessToken.for_user(User.objects.get())
        token.set_exp(lifetime=-timedelta(seconds=1))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        response = self.client.get(ME)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['code'], 'token_not_valid')

    def test_refresh_with_cookie_rotates_token(self):
        old_refresh = self.client.cookies[COOKIE].value

        response = self.client.post(REFRESH)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], 'alice')
        AccessToken(response.data['access'])
        new_refresh = response.cookies[COOKIE].value
        self.assertNotEqual(new_refresh, old_refresh)
        # The rotated-out refresh token cannot be reused.
        self.client.cookies[COOKIE] = old_refresh
        self.assertEqual(self.client.post(REFRESH).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_without_cookie(self):
        self.client.cookies.clear()
        response = self.client.post(REFRESH)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_expired_refresh_token(self):
        token = RefreshToken.for_user(User.objects.get())
        token.set_exp(lifetime=-timedelta(seconds=1))
        self.client.cookies[COOKIE] = str(token)

        response = self.client.post(REFRESH)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['detail'], 'Session expired. Please log in again.')
        self.assertEqual(response.cookies[COOKIE].value, '')  # cookie cleared

    def test_refresh_rejects_foreign_origin(self):
        response = self.client.post(REFRESH, HTTP_ORIGIN='http://evil.example')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(CORS_ALLOWED_ORIGINS=['http://127.0.0.1:5173'])
    def test_refresh_allows_frontend_origin(self):
        response = self.client.post(REFRESH, HTTP_ORIGIN='http://127.0.0.1:5173')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_logout_blacklists_and_clears_cookie(self):
        refresh = self.client.cookies[COOKIE].value

        response = self.client.post(LOGOUT)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.cookies[COOKIE].value, '')
        self.assertTrue(BlacklistedToken.objects.filter(token__token=refresh).exists())
        self.client.cookies[COOKIE] = refresh
        self.assertEqual(self.client.post(REFRESH).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_without_session_is_harmless(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.post(LOGOUT).status_code, status.HTTP_204_NO_CONTENT)

    def test_new_account_can_use_protected_api(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access}')
        self.assertEqual(self.client.get('/api/cards/').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get('/api/transactions/').status_code, status.HTTP_200_OK)


class SessionEdgeCaseTests(AuthTestBase):
    def setUp(self):
        super().setUp()
        self.register()
        self.login()

    def test_refresh_refused_after_account_deactivated(self):
        User.objects.filter(username='alice').update(is_active=False)

        response = self.client.post(REFRESH)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)
        self.assertEqual(response.cookies[COOKIE].value, '')  # stale cookie cleared

    def test_refresh_refused_after_account_deleted(self):
        # Regression: simplejwt raised DoesNotExist here, which was a 500.
        User.objects.filter(username='alice').delete()

        response = self.client.post(REFRESH)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['detail'], 'Session expired. Please log in again.')
        self.assertEqual(response.cookies[COOKIE].value, '')

    def test_logout_with_garbage_cookie_still_clears_it(self):
        self.client.cookies[COOKIE] = 'not-a-jwt'

        response = self.client.post(LOGOUT)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.cookies[COOKIE].value, '')
