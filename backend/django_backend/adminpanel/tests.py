import json
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from adminlogs.models import AdminLog
from cards.models import Card
from payments.models import Payment

User = get_user_model()

ENDPOINTS = {
    '/api/admin/summary/': 'payments.view_payment',
    '/api/admin/users/': 'auth.view_user',
    '/api/admin/cards/': 'cards.view_card',
    '/api/admin/transactions/': 'payments.view_payment',
    '/api/admin/logs/': 'adminlogs.view_adminlog',
}


def perm(codename_path):
    app_label, codename = codename_path.split('.')
    return Permission.objects.get(content_type__app_label=app_label, codename=codename)


class AdminAPITestBase(APITestCase):
    _seq = 0

    @classmethod
    def setUpTestData(cls):
        cls.superuser = User.objects.create_superuser(username='root', email='root@example.com', password='Root-pass-123!')
        cls.staff = User.objects.create_user(username='staff', password='Staff-pass-123!', is_staff=True)
        cls.alice = User.objects.create_user(username='alice', email='alice@example.com', password='Alice-pass-123!',
                                             first_name='Alice')
        cls.bob = User.objects.create_user(username='bob', email='bob@example.com', password='Bob-pass-123!')
        cls.card = Card.objects.create(
            user=cls.alice, cardholder_name='Alice Smith', masked_number='**** **** **** 1111', last4='1111',
            card_type='visa', expiry_month=12, expiry_year=timezone.localdate().year + 2,
        )
        cls.bob_card = Card.objects.create(
            user=cls.bob, cardholder_name='Bob Jones', masked_number='**** **** **** 4444', last4='4444',
            card_type='mastercard', expiry_month=6, expiry_year=timezone.localdate().year + 1,
        )
        now = timezone.now()
        cls.p1 = cls.pay(cls.alice, cls.card, '250.00', 'SUCCESS', now)
        cls.p2 = cls.pay(cls.alice, cls.card, '100.50', 'SUCCESS', now)
        cls.p3 = cls.pay(cls.bob, cls.bob_card, '15000.00', 'FAILED', now)
        cls.p4 = cls.pay(cls.bob, cls.bob_card, '75.00', 'PENDING', now)
        cls.p5 = cls.pay(cls.bob, cls.bob_card, '40.00', 'SUCCESS', now, currency='USD')
        cls.old = cls.pay(cls.alice, cls.card, '999.00', 'SUCCESS', now - timedelta(days=2))

    @classmethod
    def pay(cls, user, card, amount, status_, created, currency='INR'):
        cls._seq += 1
        payment = Payment.objects.create(
            reference=f'PAY-ADM{cls._seq:04d}', user=user, card=card, card_last4=card.last4,
            card_type=card.card_type, amount=Decimal(amount), currency=currency, status=status_,
            failure_reason='Insufficient funds.' if status_ == 'FAILED' else '',
        )
        Payment.objects.filter(pk=payment.pk).update(created_at=created, updated_at=created)
        return payment

    def auth_as(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')


class AccessControlTests(AdminAPITestBase):
    def test_anonymous_rejected(self):
        for url in ENDPOINTS:
            with self.subTest(url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_regular_user_forbidden(self):
        self.auth_as(self.alice)
        for url in ENDPOINTS:
            with self.subTest(url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_without_permissions_forbidden(self):
        self.auth_as(self.staff)
        for url in ENDPOINTS:
            with self.subTest(url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_gets_only_sections_they_have_permission_for(self):
        self.staff.user_permissions.add(perm('payments.view_payment'))
        self.auth_as(self.staff)
        for url, needed in ENDPOINTS.items():
            with self.subTest(url):
                expected = status.HTTP_200_OK if needed == 'payments.view_payment' else status.HTTP_403_FORBIDDEN
                self.assertEqual(self.client.get(url).status_code, expected)

    def test_superuser_allowed_everywhere(self):
        self.auth_as(self.superuser)
        for url in ENDPOINTS:
            with self.subTest(url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_inactive_staff_rejected(self):
        token = AccessToken.for_user(self.superuser)
        User.objects.filter(pk=self.superuser.pk).update(is_active=False)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(self.client.get('/api/admin/summary/').status_code, status.HTTP_401_UNAUTHORIZED)


class SummaryTests(AdminAPITestBase):
    def setUp(self):
        self.auth_as(self.superuser)

    def test_daily_statistics_for_today(self):
        data = self.client.get('/api/admin/summary/').data

        self.assertEqual(data['date'], timezone.localdate())
        self.assertEqual((data['total'], data['success'], data['failed'], data['pending']), (5, 3, 1, 1))
        self.assertEqual(data['success_rate'], 75.0)
        amounts = {row['currency']: row for row in data['successful_amounts']}
        self.assertEqual(amounts['INR']['total_amount'], '350.50')
        self.assertEqual(amounts['INR']['count'], 2)
        self.assertEqual(amounts['USD']['total_amount'], '40.00')

    def test_other_day_and_last_7_days(self):
        day = timezone.localdate() - timedelta(days=2)
        data = self.client.get('/api/admin/summary/', {'date': day.isoformat()}).data
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['successful_amounts'][0]['total_amount'], '999.00')

        today = self.client.get('/api/admin/summary/').data
        self.assertEqual(len(today['last_7_days']), 7)
        self.assertEqual(today['last_7_days'][0]['total'], 5)
        self.assertEqual(today['last_7_days'][2]['total'], 1)

    def test_invalid_date(self):
        response = self.client.get('/api/admin/summary/', {'date': '2026-13-45'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('date', response.data)


class ListTests(AdminAPITestBase):
    def setUp(self):
        self.auth_as(self.superuser)

    def refs(self, response):
        return {row['reference'] for row in response.data['results']}

    def test_users_list_search_and_filters(self):
        data = self.client.get('/api/admin/users/').data
        self.assertEqual(data['count'], 4)
        alice = next(u for u in data['results'] if u['username'] == 'alice')
        self.assertEqual((alice['card_count'], alice['payment_count']), (1, 3))

        self.assertEqual(self.client.get('/api/admin/users/', {'search': 'ALICE@'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/admin/users/', {'role': 'staff'}).data['count'], 2)
        self.assertEqual(self.client.get('/api/admin/users/', {'role': 'customer'}).data['count'], 2)

    def test_cards_list_masked_only(self):
        data = self.client.get('/api/admin/cards/').data
        self.assertEqual(data['count'], 2)
        self.assertEqual({c['masked_number'] for c in data['results']}, {'**** **** **** 1111', '**** **** **** 4444'})
        self.assertEqual(self.client.get('/api/admin/cards/', {'search': 'bob'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/admin/cards/', {'card_type': 'visa'}).data['count'], 1)

    def test_transactions_list_all_users_with_filters(self):
        response = self.client.get('/api/admin/transactions/')
        self.assertEqual(response.data['count'], 6)  # every user's payments
        self.assertEqual(self.refs(self.client.get('/api/admin/transactions/', {'status': 'FAILED'})), {self.p3.reference})
        self.assertEqual(self.refs(self.client.get('/api/admin/transactions/', {'search': self.p2.reference})),
                         {self.p2.reference})
        self.assertEqual(self.client.get('/api/admin/transactions/', {'search': 'bob'}).data['count'], 3)
        self.assertEqual(
            self.refs(self.client.get('/api/admin/transactions/', {'min_amount': '100', 'max_amount': '300'})),
            {self.p1.reference, self.p2.reference},
        )
        today = timezone.localdate().isoformat()
        self.assertEqual(self.client.get('/api/admin/transactions/', {'date_from': today}).data['count'], 5)
        bad = self.client.get('/api/admin/transactions/', {'min_amount': '500', 'max_amount': '1'})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination(self):
        data = self.client.get('/api/admin/transactions/', {'page_size': 2}).data
        self.assertEqual((data['count'], len(data['results'])), (6, 2))
        self.assertIsNotNone(data['next'])

    def test_admin_logs_list_and_filter(self):
        self.client.get('/api/admin/cards/')
        self.client.get('/api/admin/summary/')
        data = self.client.get('/api/admin/logs/').data
        actions = [row['action'] for row in data['results']]
        self.assertIn('card_list_viewed', actions)
        self.assertIn('daily_summary_viewed', actions)
        filtered = self.client.get('/api/admin/logs/', {'action': 'card_list_viewed'}).data
        self.assertEqual({row['action'] for row in filtered['results']}, {'card_list_viewed'})
        choices = self.client.get('/api/admin/logs/actions/').data
        self.assertIn({'value': 'login', 'label': 'Admin login'}, choices)


class UserStatusTests(AdminAPITestBase):
    def url(self, user):
        return f'/api/admin/users/{user.pk}/'

    def test_deactivate_signs_user_out_and_is_logged(self):
        refresh = RefreshToken.for_user(self.alice)
        self.auth_as(self.superuser)

        response = self.client.patch(self.url(self.alice), {'is_active': False}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.alice.refresh_from_db()
        self.assertFalse(self.alice.is_active)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresh['jti']).exists())
        entry = AdminLog.objects.get(action=AdminLog.Action.USER_UPDATED)
        self.assertEqual((entry.object_repr, entry.metadata['is_active']), ('alice', False))

        # Their existing access token no longer works.
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.alice)}')
        self.assertEqual(self.client.get('/api/cards/').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reactivate(self):
        User.objects.filter(pk=self.alice.pk).update(is_active=False)
        self.auth_as(self.superuser)
        response = self.client.patch(self.url(self.alice), {'is_active': True}, format='json')
        self.assertTrue(response.data['is_active'])

    def test_cannot_change_own_status(self):
        self.auth_as(self.superuser)
        response = self.client.patch(self.url(self.superuser), {'is_active': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_change_superuser(self):
        self.staff.user_permissions.add(perm('auth.view_user'), perm('auth.change_user'))
        self.auth_as(self.staff)
        response = self.client.patch(self.url(self.superuser), {'is_active': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.patch(self.url(self.bob), {'is_active': False}, format='json').status_code, 200)

    def test_view_only_staff_cannot_change(self):
        self.staff.user_permissions.add(perm('auth.view_user'))
        self.auth_as(self.staff)
        response = self.client.patch(self.url(self.bob), {'is_active': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_only_is_active_can_change(self):
        self.auth_as(self.superuser)
        response = self.client.patch(self.url(self.bob), {'is_staff': True, 'password': 'x'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.bob.refresh_from_db()
        self.assertFalse(self.bob.is_staff)


class NoSensitiveDataTests(AdminAPITestBase):
    def test_no_secrets_in_any_response(self):
        self.auth_as(self.superuser)
        self.client.get('/api/admin/cards/', {'search': '4111111111111111'})  # creates a log entry
        forbidden_keys = {'password', 'cvv', 'cvc', 'card_number', 'token', 'access', 'refresh'}
        secrets = [settings.SECRET_KEY, settings.SIMPLE_JWT['SIGNING_KEY'], self.alice.password,
                   self.superuser.password, '4111111111111111']

        for url in [*ENDPOINTS, '/api/admin/logs/actions/']:
            with self.subTest(url):
                body = self.client.get(url).content.decode()
                for secret in secrets:
                    self.assertNotIn(secret, body)
                self.assertNotIn('pbkdf2', body)

                def keys(value):
                    if isinstance(value, dict):
                        for k, v in value.items():
                            yield k
                            yield from keys(v)
                    elif isinstance(value, list):
                        for v in value:
                            yield from keys(v)

                self.assertFalse(forbidden_keys & set(keys(json.loads(body))))


class FilterCoverageTests(AdminAPITestBase):
    def setUp(self):
        self.auth_as(self.superuser)

    def test_users_status_filter(self):
        User.objects.filter(pk=self.bob.pk).update(is_active=False)
        inactive = self.client.get('/api/admin/users/', {'status': 'inactive'}).data
        self.assertEqual([u['username'] for u in inactive['results']], ['bob'])
        self.assertEqual(self.client.get('/api/admin/users/', {'status': 'active'}).data['count'], 3)

    def test_transactions_date_to(self):
        yesterday = (timezone.localdate() - timedelta(days=1)).isoformat()
        data = self.client.get('/api/admin/transactions/', {'date_to': yesterday}).data
        self.assertEqual([t['reference'] for t in data['results']], [self.old.reference])

    def test_logs_search(self):
        self.client.get('/api/admin/cards/')
        self.assertGreaterEqual(self.client.get('/api/admin/logs/', {'search': 'root'}).data['count'], 1)
        self.assertEqual(self.client.get('/api/admin/logs/', {'search': 'nobody-matches'}).data['count'], 0)

    def test_patch_without_is_active_rejected(self):
        response = self.client.patch(f'/api/admin/users/{self.bob.pk}/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('is_active', response.data)
