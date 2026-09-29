from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework_simplejwt.tokens import AccessToken


class ApiSecurityHeaderTests(TestCase):
    def test_api_responses_are_not_cacheable(self):
        user = get_user_model().objects.create_user(username='u', password='Some-pass-123!')
        auth = {'HTTP_AUTHORIZATION': f'Bearer {AccessToken.for_user(user)}'}
        for url in ['/api/cards/', '/api/transactions/', '/api/auth/me/']:
            with self.subTest(url):
                response = self.client.get(url, **auth)
                self.assertEqual(response['Cache-Control'], 'no-store')
                self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        # Error responses too.
        self.assertEqual(self.client.get('/api/cards/')['Cache-Control'], 'no-store')

    def test_non_api_pages_unaffected(self):
        self.assertNotEqual(self.client.get('/admin/login/').get('Cache-Control'), 'no-store')


class ApiDocumentationTests(TestCase):
    def test_docs_pages_available(self):
        for url in ['/api/docs/', '/api/redoc/']:
            with self.subTest(url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_schema_covers_every_endpoint_without_sensitive_response_fields(self):
        response = self.client.get('/api/schema/', HTTP_ACCEPT='application/vnd.oai.openapi+json')
        self.assertEqual(response.status_code, 200)
        schema = response.json()

        expected = {
            '/api/auth/register/', '/api/auth/login/', '/api/auth/refresh/', '/api/auth/logout/', '/api/auth/me/',
            '/api/cards/', '/api/cards/{id}/', '/api/transactions/', '/api/admin/summary/', '/api/admin/users/',
            '/api/admin/users/{id}/', '/api/admin/cards/', '/api/admin/transactions/', '/api/admin/logs/',
            '/api/admin/logs/actions/',
        }
        self.assertEqual(set(schema['paths']), expected)
        self.assertIn('jwtAuth', schema['components']['securitySchemes'])

        for name, component in schema['components']['schemas'].items():
            if name.endswith('Request'):
                continue  # request bodies may legitimately contain card_number / password
            for field in ('password', 'password_confirm', 'card_number', 'cvv', 'refresh'):
                self.assertNotIn(field, component.get('properties', {}), f'{name}.{field}')

        # Public endpoints are documented as public, everything else needs a token.
        for path, ops in schema['paths'].items():
            for method, op in ops.items():
                public = path in {'/api/auth/register/', '/api/auth/login/', '/api/auth/refresh/', '/api/auth/logout/'}
                with self.subTest(f'{method.upper()} {path}'):
                    self.assertEqual(any('jwtAuth' in s for s in op.get('security', [])), not public)


_SETTINGS_PROBE = """
import json
import django
from django.conf import settings as s

django.setup()
keys = ['DEBUG', 'SECURE_SSL_REDIRECT', 'SECURE_HSTS_SECONDS', 'SESSION_COOKIE_SECURE',
        'CSRF_COOKIE_SECURE', 'SECURE_HSTS_PRELOAD', 'SECURE_PROXY_SSL_HEADER']
values = {k: getattr(s, k, None) for k in keys}
values['refresh_secure'] = s.AUTH_REFRESH_COOKIE['secure']
print(json.dumps(values, default=str))
"""


class DeploymentConfigTests(TestCase):
    """Production settings only apply with DEBUG=False, so check them in a fresh interpreter."""

    def _settings_with(self, **env):
        import json
        import os
        import subprocess
        import sys
        from pathlib import Path

        run_env = {**os.environ, 'DJANGO_SETTINGS_MODULE': 'config.settings', **env}
        out = subprocess.run(
            [sys.executable, '-c', _SETTINGS_PROBE], capture_output=True, text=True, env=run_env,
            cwd=Path(__file__).resolve().parent.parent, check=True,
        ).stdout
        return json.loads(out.strip().splitlines()[-1])

    def test_production_mode_enforces_https(self):
        s = self._settings_with(DJANGO_DEBUG='False')
        self.assertFalse(s['DEBUG'])
        self.assertTrue(s['SECURE_SSL_REDIRECT'])
        self.assertEqual(s['SECURE_HSTS_SECONDS'], 31536000)
        self.assertTrue(s['SESSION_COOKIE_SECURE'])
        self.assertTrue(s['CSRF_COOKIE_SECURE'])
        self.assertTrue(s['refresh_secure'])
        self.assertFalse(s['SECURE_HSTS_PRELOAD'])
        self.assertIsNone(s['SECURE_PROXY_SSL_HEADER'])

    def test_production_behind_proxy(self):
        s = self._settings_with(DJANGO_DEBUG='False', DJANGO_SECURE_PROXY_SSL_HEADER='True')
        self.assertEqual(s['SECURE_PROXY_SSL_HEADER'], ['HTTP_X_FORWARDED_PROTO', 'https'])

    def test_development_mode_relaxed(self):
        s = self._settings_with(DJANGO_DEBUG='True')
        self.assertTrue(s['DEBUG'])
        self.assertFalse(s['SESSION_COOKIE_SECURE'])
        self.assertFalse(s['SECURE_SSL_REDIRECT'])
        self.assertFalse(s['refresh_secure'])


class EntrypointTests(TestCase):
    def test_wsgi_and_asgi_applications_load(self):
        from config.asgi import application as asgi_app
        from config.wsgi import application as wsgi_app
        self.assertTrue(callable(wsgi_app))
        self.assertTrue(callable(asgi_app))


class ClientIpTests(TestCase):
    """X-Forwarded-For is client-controlled; it must not defeat rate limiting."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()

    def test_spoofed_forwarded_for_does_not_bypass_login_throttle(self):
        # Regression: with DRF's default NUM_PROXIES=None every spoofed address counted as a new client.
        codes = [
            self.client.post('/api/auth/login/', {'username': 'nobody', 'password': 'x'},
                             content_type='application/json', HTTP_X_FORWARDED_FOR=f'10.0.0.{i}').status_code
            for i in range(12)
        ]
        self.assertIn(429, codes)

    def _remote_addr(self, num_proxies, forwarded_for):
        from django.http import HttpResponse
        from django.test import RequestFactory, override_settings

        from .middleware import RealClientIPMiddleware

        seen = {}
        with override_settings(NUM_PROXIES=num_proxies):
            middleware = RealClientIPMiddleware(lambda r: seen.setdefault('ip', r.META['REMOTE_ADDR']) and HttpResponse())
        request = RequestFactory().get('/', REMOTE_ADDR='172.18.0.5', HTTP_X_FORWARDED_FOR=forwarded_for)
        middleware(request)
        return seen['ip']

    def test_forwarded_for_ignored_without_trusted_proxy(self):
        self.assertEqual(self._remote_addr(0, '203.0.113.9'), '172.18.0.5')

    def test_one_trusted_proxy_uses_the_address_it_saw(self):
        # The client may prepend fake hops; only the last entry (added by nginx) is trusted.
        self.assertEqual(self._remote_addr(1, '6.6.6.6, 203.0.113.9'), '203.0.113.9')

    def test_too_few_hops_keeps_peer_address(self):
        self.assertEqual(self._remote_addr(2, '203.0.113.9'), '172.18.0.5')
