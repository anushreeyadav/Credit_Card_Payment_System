"""Admin panel tests: login, every required view, the daily summary, and data exposure."""

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.admin.models import ADDITION, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.cache import cache
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone

from cards.models import Card

from .admin import daily_summary
from .models import Payment

User = get_user_model()

ADMIN_PASSWORD = 'Adm1n-test-pass!'


class AdminTestBase(TestCase):
    _seq = 0

    @classmethod
    def setUpTestData(cls):
        cls.admin_user = User.objects.create_superuser(
            username='admin', email='admin@example.com', password=ADMIN_PASSWORD
        )
        cls.alice = User.objects.create_user(username='alice', email='alice@example.com', password='alice-pass-123')
        cls.bob = User.objects.create_user(username='bob', email='bob@example.com', password='bob-pass-123')
        cls.card = Card.objects.create(
            user=cls.alice, cardholder_name='Alice Smith', masked_number='**** **** **** 1111',
            last4='1111', card_type='visa', expiry_month=12, expiry_year=timezone.localdate().year + 2,
        )
        now = timezone.now()
        yesterday = now - timedelta(days=1)
        cls.p_ok1 = cls.pay(cls.alice, '250.00', 'SUCCESS', now)
        cls.p_ok2 = cls.pay(cls.alice, '100.50', 'SUCCESS', now)
        cls.p_usd = cls.pay(cls.alice, '40.00', 'SUCCESS', now, currency='USD')
        cls.p_fail = cls.pay(cls.alice, '15000.00', 'FAILED', now)
        cls.p_pend = cls.pay(cls.alice, '75.00', 'PENDING', now)
        cls.p_old = cls.pay(cls.bob, '999.00', 'SUCCESS', yesterday, card=None)

    @classmethod
    def pay(cls, user, amount, status, created, currency='INR', card='default'):
        cls._seq += 1
        card = cls.card if card == 'default' else card
        payment = Payment.objects.create(
            reference=f'PAY-ADMIN{cls._seq:04d}', user=user, card=card,
            card_last4='1111' if card else '4444', card_type='visa', amount=Decimal(amount),
            currency=currency, status=status,
            failure_reason='Insufficient funds.' if status == 'FAILED' else '',
        )
        Payment.objects.filter(pk=payment.pk).update(created_at=created, updated_at=created)
        payment.refresh_from_db()
        return payment

    def login_admin(self):
        self.client.force_login(self.admin_user)


class AdminLoginTests(AdminTestBase):
    def setUp(self):
        cache.clear()  # reset the admin-login lockout counter

    def test_admin_login_with_password(self):
        response = self.client.post(
            '/admin/login/?next=/admin/',
            {'username': 'admin', 'password': ADMIN_PASSWORD, 'next': '/admin/'},
        )
        self.assertRedirects(response, '/admin/')
        index = self.client.get('/admin/')
        self.assertEqual(index.status_code, 200)
        self.assertContains(index, 'Credit Card Payment System Admin')

    def test_wrong_password_rejected(self):
        response = self.client.post('/admin/login/', {'username': 'admin', 'password': 'wrong'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Please enter the correct username and password')
        self.assertEqual(self.client.get('/admin/').status_code, 302)

    def test_non_staff_user_cannot_log_in(self):
        response = self.client.post('/admin/login/', {'username': 'alice', 'password': 'alice-pass-123'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/admin/').status_code, 302)

    def test_anonymous_redirected_to_login(self):
        for url in ['/admin/', '/admin/auth/user/', '/admin/cards/card/', '/admin/payments/payment/',
                    '/admin/admin/logentry/', '/admin/payments/payment/daily-summary/']:
            with self.subTest(url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 302)
                self.assertIn('/admin/login/', response['Location'])


class AdminViewTests(AdminTestBase):
    def setUp(self):
        self.login_admin()

    def test_index_lists_all_sections(self):
        response = self.client.get('/admin/')
        for label in ['Users', 'Cards', 'Transactions', 'Log entries']:
            self.assertContains(response, label)

    # Users
    def test_view_users(self):
        response = self.client.get('/admin/auth/user/')
        self.assertContains(response, 'alice')
        self.assertContains(response, 'bob')
        self.assertContains(response, 'Transactions')  # count column

    def test_search_users(self):
        response = self.client.get('/admin/auth/user/', {'q': 'alice'})
        self.assertContains(response, 'alice@example.com')
        self.assertNotContains(response, 'bob@example.com')

    def test_user_detail_shows_cards_but_not_password_hash(self):
        response = self.client.get(f'/admin/auth/user/{self.alice.pk}/change/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '**** **** **** 1111')
        # Django shows only a masked summary of the hash, never the full value.
        hash_value = self.alice.password.split('$')[-1]
        self.assertNotContains(response, self.alice.password)
        self.assertNotContains(response, hash_value)

    # Cards
    def test_view_cards(self):
        response = self.client.get('/admin/cards/card/')
        self.assertContains(response, '**** **** **** 1111')
        self.assertContains(response, 'Alice Smith')
        detail = self.client.get(f'/admin/cards/card/{self.card.pk}/change/')
        self.assertEqual(detail.status_code, 200)

    def test_cards_are_read_only(self):
        self.assertEqual(self.client.get('/admin/cards/card/add/').status_code, 403)
        response = self.client.post(f'/admin/cards/card/{self.card.pk}/change/', {'cardholder_name': 'Hacked'})
        self.assertEqual(response.status_code, 403)
        self.card.refresh_from_db()
        self.assertEqual(self.card.cardholder_name, 'Alice Smith')

    # Transactions
    def test_view_transactions_with_status_amount_and_timestamps(self):
        response = self.client.get('/admin/payments/payment/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.p_ok1.reference)
        for column in ['Status', 'Amount', 'Created at', 'Updated at']:
            self.assertContains(response, column)
        self.assertContains(response, '15000.00')
        self.assertContains(response, 'FAILED')

        detail = self.client.get(f'/admin/payments/payment/{self.p_fail.pk}/change/')
        self.assertEqual(detail.status_code, 200)
        self.assertContains(detail, 'Insufficient funds.')

    def test_filter_transactions(self):
        response = self.client.get('/admin/payments/payment/', {'status': 'FAILED'})
        self.assertContains(response, self.p_fail.reference)
        self.assertNotContains(response, self.p_ok1.reference)

        response = self.client.get('/admin/payments/payment/', {'amount_range': 'gt10000'})
        self.assertContains(response, self.p_fail.reference)
        self.assertNotContains(response, self.p_ok1.reference)

        response = self.client.get('/admin/payments/payment/', {'currency': 'USD'})
        self.assertContains(response, self.p_usd.reference)
        self.assertNotContains(response, self.p_ok1.reference)

    def test_search_transaction_reference(self):
        response = self.client.get('/admin/payments/payment/', {'q': self.p_pend.reference})
        self.assertContains(response, self.p_pend.reference)
        self.assertNotContains(response, self.p_ok1.reference)

    def test_transactions_are_read_only(self):
        self.assertEqual(self.client.get('/admin/payments/payment/add/').status_code, 403)
        response = self.client.post(f'/admin/payments/payment/{self.p_pend.pk}/change/', {'status': 'SUCCESS'})
        self.assertEqual(response.status_code, 403)
        response = self.client.post(f'/admin/payments/payment/{self.p_pend.pk}/delete/', {'post': 'yes'})
        self.assertEqual(response.status_code, 403)
        self.p_pend.refresh_from_db()
        self.assertEqual(self.p_pend.status, 'PENDING')

    # Admin logs
    def test_view_admin_logs(self):
        LogEntry.objects.create(
            user=self.admin_user,
            content_type=ContentType.objects.get_for_model(User),
            object_id=str(self.bob.pk), object_repr='bob', action_flag=ADDITION, change_message='Added.',
        )
        response = self.client.get('/admin/admin/logentry/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'bob')
        self.assertContains(response, 'Added')
        entry = LogEntry.objects.get()
        self.assertEqual(self.client.get(f'/admin/admin/logentry/{entry.pk}/change/').status_code, 200)
        self.assertEqual(self.client.post(f'/admin/admin/logentry/{entry.pk}/delete/', {'post': 'yes'}).status_code, 403)
        self.assertTrue(LogEntry.objects.filter(pk=entry.pk).exists())

    def test_changes_are_logged(self):
        self.client.post(f'/admin/auth/user/{self.bob.pk}/change/', {
            'username': 'bob', 'email': 'bob@new.example.com', 'is_active': 'on',
            'date_joined_0': '2026-01-01', 'date_joined_1': '00:00:00',
            'cards-TOTAL_FORMS': '0', 'cards-INITIAL_FORMS': '0',
        })
        self.assertTrue(LogEntry.objects.filter(object_repr='bob').exists())

    # Sensitive data
    def test_no_sensitive_data_on_any_page(self):
        pages = [
            '/admin/', '/admin/auth/user/', f'/admin/auth/user/{self.alice.pk}/change/',
            '/admin/cards/card/', f'/admin/cards/card/{self.card.pk}/change/',
            '/admin/payments/payment/', f'/admin/payments/payment/{self.p_ok1.pk}/change/',
            '/admin/payments/payment/daily-summary/', '/admin/admin/logentry/',
        ]
        secrets = [settings.SIMPLE_JWT['SIGNING_KEY'], settings.SECRET_KEY, self.alice.password, self.admin_user.password]
        for url in pages:
            with self.subTest(url):
                body = self.client.get(url).content.decode()
                for secret in secrets:
                    self.assertNotIn(secret, body)
                self.assertNotRegex(body, r'(?<![\d*])\d{13,19}(?!\d)')
                self.assertNotIn('cvv', body.lower())


class DailySummaryTests(AdminTestBase):
    URL = '/admin/payments/payment/daily-summary/'

    def test_summary_aggregates_today(self):
        summary = daily_summary(timezone.localdate())

        self.assertEqual(summary['total'], 5)
        self.assertEqual(summary['success'], 3)
        self.assertEqual(summary['failed'], 1)
        self.assertEqual(summary['pending'], 1)
        self.assertEqual(summary['success_rate'], 75.0)  # 3 of 4 completed
        by_currency = {row['currency']: row for row in summary['successful_amounts']}
        self.assertEqual(by_currency['INR']['total_amount'], Decimal('350.50'))
        self.assertEqual(by_currency['INR']['count'], 2)
        self.assertEqual(by_currency['INR']['average_amount'], Decimal('175.25'))
        self.assertEqual(by_currency['USD']['total_amount'], Decimal('40.00'))

    def test_summary_page(self):
        self.login_admin()
        response = self.client.get(self.URL)

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Daily payment summary')
        self.assertContains(response, '<div class="value" id="summary-total">5</div>', html=False)
        self.assertContains(response, '<div class="value" id="summary-success">3</div>', html=False)
        self.assertContains(response, '<div class="value" id="summary-failed">1</div>', html=False)
        self.assertContains(response, '<div class="value" id="summary-pending">1</div>', html=False)
        self.assertContains(response, 'id="summary-amount-INR">350.50<', html=False)
        self.assertContains(response, 'id="summary-amount-USD">40.00<', html=False)

    def test_summary_for_other_day(self):
        self.login_admin()
        yesterday = timezone.localdate() - timedelta(days=1)
        response = self.client.get(self.URL, {'date': yesterday.isoformat()})
        self.assertContains(response, '<div class="value" id="summary-total">1</div>', html=False)
        self.assertContains(response, 'id="summary-amount-INR">999.00<', html=False)

    def test_summary_empty_day(self):
        self.login_admin()
        response = self.client.get(self.URL, {'date': '2020-01-01'})
        self.assertContains(response, '<div class="value" id="summary-total">0</div>', html=False)
        self.assertContains(response, 'No successful payments on this day.')

    def test_summary_invalid_date_falls_back_to_today(self):
        self.login_admin()
        response = self.client.get(self.URL, {'date': 'not-a-date'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Invalid date')
        self.assertContains(response, '<div class="value" id="summary-total">5</div>', html=False)

    def test_changelist_links_to_summary(self):
        self.login_admin()
        self.assertContains(self.client.get('/admin/payments/payment/'), self.URL)

    def test_staff_without_permission_denied(self):
        staff = User.objects.create_user(username='staff', password='staff-pass-123', is_staff=True)
        self.client.force_login(staff)
        self.assertEqual(self.client.get(self.URL).status_code, 403)

        staff.user_permissions.add(Permission.objects.get(codename='view_payment'))
        self.assertEqual(self.client.get(self.URL).status_code, 200)
