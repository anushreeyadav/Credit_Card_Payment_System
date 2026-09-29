import json
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from cards.models import Card
from payments.models import Payment

from .models import AdminLog
from .sanitize import REDACTED, scrub, scrub_text

User = get_user_model()
Action = AdminLog.Action

ADMIN_PASSWORD = 'Adm1n-audit-pass!'
TEST_CARD = '4111111111111111'


def dump_logs():
    """Every stored AdminLog value as one string, for leak checks."""
    return json.dumps(list(AdminLog.objects.values()), default=str)


class AdminLogTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin_user = User.objects.create_superuser(username='admin', password=ADMIN_PASSWORD)
        cls.alice = User.objects.create_user(username='alice', email='alice@example.com', password='alice-pass-123')
        cls.card = Card.objects.create(
            user=cls.alice, cardholder_name='Alice Smith', masked_number='**** **** **** 1111',
            last4='1111', card_type='visa', expiry_month=12, expiry_year=timezone.localdate().year + 2,
        )
        cls.payment = Payment.objects.create(
            reference='PAY-AUDIT0001', user=cls.alice, card=cls.card, card_last4='1111',
            card_type='visa', amount=Decimal('250.00'), currency='INR', status='SUCCESS',
        )

    def setUp(self):
        cache.clear()  # reset the admin-login lockout counter

    def login_admin(self):
        # force_login does not go through the admin login view, so it creates no LOGIN entry.
        self.client.force_login(self.admin_user)

    def only_log(self, action):
        entries = AdminLog.objects.filter(action=action)
        self.assertEqual(entries.count(), 1, f'expected exactly one {action} entry')
        return entries.get()


class LoginLogTests(AdminLogTestBase):
    def test_admin_login_is_logged(self):
        self.client.post('/admin/login/', {'username': 'admin', 'password': ADMIN_PASSWORD, 'next': '/admin/'},
                         HTTP_USER_AGENT='AuditTest/1.0')

        entry = self.only_log(Action.LOGIN)
        self.assertEqual(entry.user, self.admin_user)
        self.assertEqual(entry.username, 'admin')
        self.assertEqual(entry.ip_address, '127.0.0.1')
        self.assertEqual(entry.user_agent, 'AuditTest/1.0')
        self.assertIsNotNone(entry.created_at)
        self.assertNotIn(ADMIN_PASSWORD, dump_logs())

    def test_failed_login_is_logged_without_password(self):
        self.client.post('/admin/login/', {'username': 'admin', 'password': 'Wrong-Pass-999'})

        entry = self.only_log(Action.LOGIN_FAILED)
        self.assertIsNone(entry.user)
        self.assertEqual(entry.username, 'admin')
        self.assertNotIn('Wrong-Pass-999', dump_logs())
        self.assertFalse(AdminLog.objects.filter(action=Action.LOGIN).exists())

    def test_logout_is_logged(self):
        self.login_admin()
        self.client.post('/admin/logout/')
        self.assertEqual(self.only_log(Action.LOGOUT).user, self.admin_user)

    def test_non_admin_logins_are_not_logged(self):
        # Logins outside /admin/ (e.g. future API auth) are not admin actions.
        self.client.login(username='alice', password='alice-pass-123')
        self.assertFalse(AdminLog.objects.exists())


class UserManagementLogTests(AdminLogTestBase):
    def setUp(self):
        self.login_admin()

    def test_user_created(self):
        self.client.post('/admin/auth/user/add/', {
            'username': 'carol', 'password1': 'Carol-New-Pass-1', 'password2': 'Carol-New-Pass-1',
            'usable_password': 'true',
        })

        entry = self.only_log(Action.USER_CREATED)
        self.assertEqual(entry.object_repr, 'carol')
        self.assertEqual(entry.object_type, 'auth.User')
        self.assertEqual(entry.user, self.admin_user)
        self.assertNotIn('Carol-New-Pass-1', dump_logs())

    def test_user_updated_records_field_names_only(self):
        self.client.post(f'/admin/auth/user/{self.alice.pk}/change/', {
            'username': 'alice', 'email': 'alice.new@example.com', 'is_active': 'on', 'is_staff': 'on',
            'date_joined_0': '2026-01-01', 'date_joined_1': '00:00:00',
            'cards-TOTAL_FORMS': '1', 'cards-INITIAL_FORMS': '1', 'cards-0-id': str(self.card.pk),
            'cards-0-user': str(self.alice.pk),
        })

        entry = self.only_log(Action.USER_UPDATED)
        self.assertEqual(entry.object_id, str(self.alice.pk))
        self.assertIn('Email address', entry.metadata['changed_fields'])
        self.assertIn('Staff status', entry.metadata['changed_fields'])
        self.assertNotIn('alice.new@example.com', dump_logs())

    def test_password_change_logged_without_password(self):
        self.client.post(f'/admin/auth/user/{self.alice.pk}/password/', {
            'password1': 'Brand-New-Pass-42', 'password2': 'Brand-New-Pass-42', 'usable_password': 'true',
        })

        entry = self.only_log(Action.USER_PASSWORD_CHANGED)
        self.assertEqual(entry.object_repr, 'alice')
        logs = dump_logs()
        self.assertNotIn('Brand-New-Pass-42', logs)
        self.alice.refresh_from_db()
        self.assertNotIn(self.alice.password, logs)
        self.assertNotIn('pbkdf2', logs)

    def test_user_deleted(self):
        bob = User.objects.create_user(username='bob', password='bob-pass-123')

        self.client.post(f'/admin/auth/user/{bob.pk}/delete/', {'post': 'yes'})

        self.assertFalse(User.objects.filter(pk=bob.pk).exists())
        entry = self.only_log(Action.USER_DELETED)
        self.assertEqual(entry.object_repr, 'bob')
        self.assertEqual(entry.object_id, str(bob.pk))


class CardAndTransactionLogTests(AdminLogTestBase):
    def setUp(self):
        self.login_admin()

    def test_card_list_and_detail_views_logged(self):
        self.client.get('/admin/cards/card/', {'card_type': 'visa'})
        self.client.get(f'/admin/cards/card/{self.card.pk}/change/')

        listing = self.only_log(Action.CARD_LIST_VIEWED)
        self.assertEqual(listing.metadata['query'], {'card_type': 'visa'})
        detail = self.only_log(Action.CARD_VIEWED)
        self.assertEqual(detail.object_id, str(self.card.pk))
        self.assertIn('**** **** **** 1111', detail.object_repr)

    def test_card_number_typed_into_search_is_redacted(self):
        self.client.get('/admin/cards/card/', {'q': TEST_CARD})
        self.client.get('/admin/cards/card/', {'q': '4111 1111 1111 1111'})

        for entry in AdminLog.objects.filter(action=Action.CARD_LIST_VIEWED):
            self.assertEqual(entry.metadata['query']['q'], REDACTED)
        self.assertNotIn(TEST_CARD, dump_logs())
        self.assertNotIn('4111 1111 1111 1111', dump_logs())

    def test_transaction_views_logged(self):
        self.client.get('/admin/payments/payment/', {'status': 'SUCCESS', 'q': 'PAY-AUDIT'})
        self.client.get(f'/admin/payments/payment/{self.payment.pk}/change/')

        listing = self.only_log(Action.TRANSACTION_LIST_VIEWED)
        self.assertEqual(listing.metadata['query'], {'status': 'SUCCESS', 'q': 'PAY-AUDIT'})
        detail = self.only_log(Action.TRANSACTION_VIEWED)
        self.assertEqual(detail.object_id, str(self.payment.pk))
        self.assertIn('PAY-AUDIT0001', detail.object_repr)

    def test_transaction_export_logged(self):
        response = self.client.post('/admin/payments/payment/', {
            'action': 'export_as_csv', '_selected_action': [self.payment.pk],
        })
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')

        entry = self.only_log(Action.TRANSACTIONS_EXPORTED)
        self.assertEqual(entry.user, self.admin_user)
        self.assertEqual(entry.metadata['row_count'], 1)
        self.assertEqual(entry.metadata['references'], ['PAY-AUDIT0001'])
        self.assertIn('masked_card', entry.metadata['columns'])

    def test_daily_summary_view_logged(self):
        self.client.get('/admin/payments/payment/daily-summary/', {'date': '2026-09-01'})
        self.assertEqual(self.only_log(Action.DAILY_SUMMARY_VIEWED).metadata, {'date': '2026-09-01'})

    def test_denied_views_are_not_logged(self):
        self.client.logout()
        self.client.get('/admin/payments/payment/')
        self.client.get(f'/admin/cards/card/{self.card.pk}/change/')
        self.assertFalse(AdminLog.objects.exclude(action=Action.LOGOUT).exists())


class AdminLogAdminTests(AdminLogTestBase):
    def setUp(self):
        self.login_admin()
        self.client.get(f'/admin/payments/payment/{self.payment.pk}/change/')
        self.entry = AdminLog.objects.get()

    def test_admin_logs_displayed(self):
        response = self.client.get('/admin/adminlogs/adminlog/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Transaction viewed')
        self.assertContains(response, 'PAY-AUDIT0001')

        detail = self.client.get(f'/admin/adminlogs/adminlog/{self.entry.pk}/change/')
        self.assertEqual(detail.status_code, 200)
        self.assertContains(detail, '127.0.0.1')

        filtered = self.client.get('/admin/adminlogs/adminlog/', {'action': 'login'})
        self.assertNotContains(filtered, 'PAY-AUDIT0001')

    def test_admin_logs_are_read_only(self):
        self.assertEqual(self.client.get('/admin/adminlogs/adminlog/add/').status_code, 403)
        self.assertEqual(
            self.client.post(f'/admin/adminlogs/adminlog/{self.entry.pk}/delete/', {'post': 'yes'}).status_code,
            403,
        )
        self.assertTrue(AdminLog.objects.filter(pk=self.entry.pk).exists())


class NoSecretsStoredTests(AdminLogTestBase):
    def test_full_admin_session_stores_no_secrets(self):
        jwt = str(AccessToken.for_user(self.alice))
        self.client.post('/admin/login/', {'username': 'admin', 'password': ADMIN_PASSWORD, 'next': '/admin/'})
        self.client.post('/admin/login/', {'username': 'admin', 'password': 'Bad-Guess-1'})
        self.client.force_login(self.admin_user)
        self.client.get('/admin/cards/card/', {'q': TEST_CARD})
        self.client.get('/admin/payments/payment/', {'q': jwt})
        self.client.post(f'/admin/auth/user/{self.alice.pk}/password/', {
            'password1': 'Another-Pass-77', 'password2': 'Another-Pass-77', 'usable_password': 'true',
        })
        self.client.post('/admin/payments/payment/', {'action': 'export_as_csv', '_selected_action': [self.payment.pk]})
        self.client.post('/admin/logout/')

        self.assertGreaterEqual(AdminLog.objects.count(), 7)
        logs = dump_logs()
        self.alice.refresh_from_db()
        for secret in [ADMIN_PASSWORD, 'Bad-Guess-1', 'Another-Pass-77', self.alice.password,
                       self.admin_user.password, TEST_CARD, jwt, settings.SECRET_KEY,
                       settings.SIMPLE_JWT['SIGNING_KEY']]:
            self.assertNotIn(secret, logs)
        self.assertNotIn('pbkdf2', logs)
        self.assertNotIn('cvv', logs.lower())


class SanitizeTests(TestCase):
    def test_sensitive_keys_dropped(self):
        cleaned = scrub({
            'password': 'x', 'new_password1': 'x', 'cvv': '123', 'card_number': TEST_CARD, 'token': 't',
            'Authorization': 'Bearer t', 'secret_key': 's', 'csrfmiddlewaretoken': 'c', 'status': 'SUCCESS',
        })
        self.assertEqual(cleaned['status'], 'SUCCESS')
        for key in ['password', 'new_password1', 'cvv', 'card_number', 'token', 'Authorization',
                    'secret_key', 'csrfmiddlewaretoken']:
            self.assertEqual(cleaned[key], REDACTED, key)

    def test_card_numbers_and_jwts_redacted_in_values(self):
        self.assertEqual(scrub_text(f'search {TEST_CARD} now'), f'search {REDACTED} now')
        self.assertEqual(scrub_text('5555-5555-5555-4444'), REDACTED)
        self.assertEqual(scrub_text('eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoxfQ.sig'), REDACTED)
        self.assertEqual(scrub({'nested': [{'q': TEST_CARD}]}), {'nested': [{'q': REDACTED}]})

    def test_safe_values_kept(self):
        self.assertEqual(scrub_text('PAY-5EC1A6C3C08348AF'), 'PAY-5EC1A6C3C08348AF')
        self.assertEqual(scrub_text('**** **** **** 1111'), '**** **** **** 1111')
        self.assertEqual(scrub_text('2026-09-29'), '2026-09-29')
        self.assertEqual(scrub({'row_count': 3, 'ok': True}), {'row_count': 3, 'ok': True})
        self.assertEqual(len(scrub_text('x' * 500)), 200)


class AdminLoginLockoutTests(AdminLogTestBase):
    def attempt(self, password):
        return self.client.post('/admin/login/', {'username': 'admin', 'password': password, 'next': '/admin/'})

    def test_lockout_after_repeated_failures(self):
        for _ in range(5):
            self.assertEqual(self.attempt('Wrong-Pass-1').status_code, 200)  # login form with error

        # Now even the correct password is refused until the window expires.
        response = self.attempt(ADMIN_PASSWORD)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(self.client.get('/admin/').status_code, 302)
        entry = AdminLog.objects.filter(action=Action.LOGIN_FAILED, metadata__locked_out=True).get()
        self.assertEqual(entry.username, 'admin')
        self.assertNotIn(ADMIN_PASSWORD, dump_logs())

        cache.clear()  # window expired
        self.assertRedirects(self.attempt(ADMIN_PASSWORD), '/admin/')

    def test_successful_login_resets_counter(self):
        for _ in range(4):
            self.attempt('Wrong-Pass-1')
        self.assertRedirects(self.attempt(ADMIN_PASSWORD), '/admin/')
        self.client.logout()
        for _ in range(4):
            self.attempt('Wrong-Pass-1')
        self.assertRedirects(self.attempt(ADMIN_PASSWORD), '/admin/')

    def test_login_page_itself_still_loads_when_locked(self):
        for _ in range(5):
            self.attempt('Wrong-Pass-1')
        self.assertEqual(self.client.get('/admin/login/').status_code, 200)


class AuditInternalsTests(AdminLogTestBase):
    def test_malformed_change_message_gives_no_fields(self):
        from .mixins import _changed_fields
        self.assertEqual(_changed_fields('not json'), [])
        self.assertEqual(_changed_fields([{'changed': {'fields': ['Email address']}}]), ['Email address'])
        self.assertEqual(_changed_fields([{'added': {'name': 'card'}}]), ['card'])

    def test_changes_to_non_user_objects_are_logged_generically(self):
        from django.contrib import admin
        from django.test import RequestFactory

        request = RequestFactory().post('/admin/cards/card/1/change/')
        request.user = self.admin_user
        admin.site._registry[Card].log_change(request, self.card, '[{"changed": {"fields": ["Cardholder name"]}}]')

        entry = self.only_log(Action.OBJECT_UPDATED)
        self.assertEqual(entry.object_type, 'cards.Card')
        self.assertEqual(entry.metadata['changed_fields'], ['Cardholder name'])

    def test_scrub_depth_limit(self):
        deep = {'a': {'b': {'c': {'d': {'e': {'f': 'too deep'}}}}}}
        self.assertEqual(scrub(deep)['a']['b']['c']['d']['e'], REDACTED)
