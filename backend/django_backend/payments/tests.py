import csv
import io
from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from cards.models import Card

from .admin import CSV_COLUMNS
from .models import Payment

User = get_user_model()

URL = '/api/transactions/'


def at(y, m, d, hh=12, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm))


class PaymentFactoryMixin:
    _seq = 0

    def make_card(self, user, last4='1111'):
        return Card.objects.create(
            user=user,
            cardholder_name='Test User',
            masked_number=f'**** **** **** {last4}',
            last4=last4,
            card_type='visa',
            expiry_month=12,
            expiry_year=timezone.localdate().year + 2,
        )

    def make_payment(self, user, card, amount, status_='SUCCESS', created=None, description=''):
        PaymentFactoryMixin._seq += 1
        payment = Payment.objects.create(
            reference=f'PAY-TEST{PaymentFactoryMixin._seq:016d}',
            user=user,
            card=card,
            card_last4=card.last4,
            card_type=card.card_type,
            amount=Decimal(amount),
            currency='INR',
            description=description,
            status=status_,
            failure_reason='Insufficient funds.' if status_ == 'FAILED' else '',
        )
        if created:
            # created_at is auto_now_add, so set it after creation.
            Payment.objects.filter(pk=payment.pk).update(created_at=created, updated_at=created)
            payment.refresh_from_db()
        return payment


class TransactionHistoryTests(PaymentFactoryMixin, APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', password='test-pass-123')
        self.bob = User.objects.create_user(username='bob', password='test-pass-123')
        self.alice_card = self.make_card(self.alice)
        self.bob_card = self.make_card(self.bob, last4='4444')

        p = self.make_payment
        a, c = self.alice, self.alice_card
        self.a1 = p(a, c, '50.00', 'SUCCESS', at(2026, 1, 10))
        self.a2 = p(a, c, '150.00', 'FAILED', at(2026, 2, 15))
        self.a3 = p(a, c, '500.00', 'SUCCESS', at(2026, 3, 20))
        self.a4 = p(a, c, '1000.00', 'PENDING', at(2026, 3, 31, 23, 59))
        self.a5 = p(a, c, '2500.00', 'SUCCESS', at(2026, 4, 1, 0, 0))
        self.b1 = p(self.bob, self.bob_card, '300.00', 'SUCCESS', at(2026, 3, 20))

        self.auth_as(self.alice)

    def auth_as(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')

    def refs(self, response):
        return [t['reference'] for t in response.data['results']]

    # 1. Transaction history
    def test_history_lists_own_transactions_newest_first(self):
        response = self.client.get(URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 5)
        self.assertEqual(
            self.refs(response),
            [self.a5.reference, self.a4.reference, self.a3.reference, self.a2.reference, self.a1.reference],
        )
        first = response.data['results'][0]
        self.assertEqual(first['masked_card'], '**** **** **** 1111')
        self.assertEqual(first['amount'], '2500.00')
        self.assertEqual(
            set(first),
            {'reference', 'status', 'failure_reason', 'amount', 'currency', 'description', 'card_id',
             'card_type', 'masked_card', 'created_at', 'updated_at'},
        )

    def test_history_survives_card_deletion(self):
        self.alice_card.delete()

        response = self.client.get(URL)

        self.assertEqual(response.data['count'], 5)
        self.assertIsNone(response.data['results'][0]['card_id'])
        self.assertEqual(response.data['results'][0]['masked_card'], '**** **** **** 1111')

    # 2. Status filter
    def test_status_filter(self):
        response = self.client.get(URL, {'status': 'SUCCESS'})
        self.assertEqual(set(self.refs(response)), {self.a1.reference, self.a3.reference, self.a5.reference})

        self.assertEqual(self.refs(self.client.get(URL, {'status': 'FAILED'})), [self.a2.reference])
        self.assertEqual(self.refs(self.client.get(URL, {'status': 'pending'})), [self.a4.reference])

    # 3. Amount filter
    def test_amount_filter(self):
        response = self.client.get(URL, {'min_amount': '100', 'max_amount': '1000'})
        self.assertEqual(set(self.refs(response)), {self.a2.reference, self.a3.reference, self.a4.reference})

        self.assertEqual(set(self.refs(self.client.get(URL, {'min_amount': '1000'}))),
                         {self.a4.reference, self.a5.reference})
        self.assertEqual(self.refs(self.client.get(URL, {'max_amount': '50'})), [self.a1.reference])

    # 4. Date filter (date_to is inclusive of the whole day)
    def test_date_filter(self):
        response = self.client.get(URL, {'date_from': '2026-03-01', 'date_to': '2026-03-31'})
        self.assertEqual(set(self.refs(response)), {self.a3.reference, self.a4.reference})

        self.assertEqual(set(self.refs(self.client.get(URL, {'date_from': '2026-04-01'}))), {self.a5.reference})
        self.assertEqual(set(self.refs(self.client.get(URL, {'date_to': '2026-01-10'}))), {self.a1.reference})
        self.assertEqual(self.refs(self.client.get(URL, {'date_from': '2026-05-01'})), [])

    # 5. Combined filters
    def test_combined_filters(self):
        response = self.client.get(URL, {
            'status': 'SUCCESS',
            'min_amount': '100',
            'max_amount': '3000',
            'date_from': '2026-03-01',
            'date_to': '2026-04-30',
        })
        self.assertEqual(self.refs(response), [self.a5.reference, self.a3.reference])

    # 6. Pagination
    def test_pagination(self):
        for i in range(20):
            self.make_payment(self.alice, self.alice_card, '10.00', 'SUCCESS', at(2025, 6, 1 + i))

        page1 = self.client.get(URL)
        self.assertEqual(page1.data['count'], 25)
        self.assertEqual(len(page1.data['results']), 10)
        self.assertIsNone(page1.data['previous'])
        self.assertIn('page=2', page1.data['next'])

        page3 = self.client.get(URL, {'page': 3})
        self.assertEqual(len(page3.data['results']), 5)
        self.assertIsNone(page3.data['next'])

        self.assertEqual(len(self.client.get(URL, {'page_size': 7}).data['results']), 7)
        self.assertEqual(len(self.client.get(URL, {'page_size': 1000}).data['results']), 25)  # capped at 100

        all_refs = []
        for page in (1, 2, 3):
            all_refs += self.refs(self.client.get(URL, {'page': page}))
        self.assertEqual(len(all_refs), len(set(all_refs)), 'pages must not overlap')

        self.assertEqual(self.client.get(URL, {'page': 99}).status_code, status.HTTP_404_NOT_FOUND)

    def test_pagination_keeps_filters_in_links(self):
        for i in range(12):
            self.make_payment(self.alice, self.alice_card, '10.00', 'FAILED', at(2025, 6, 1 + i))

        response = self.client.get(URL, {'status': 'FAILED'})

        self.assertEqual(response.data['count'], 13)
        self.assertIn('status=FAILED', response.data['next'])

    # 7. User isolation
    def test_user_isolation(self):
        alice_refs = set(self.refs(self.client.get(URL, {'page_size': 100})))
        self.assertNotIn(self.b1.reference, alice_refs)

        self.auth_as(self.bob)
        response = self.client.get(URL)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(self.refs(response), [self.b1.reference])

        # Filters can't widen the scope to other users either.
        self.assertEqual(self.client.get(URL, {'min_amount': '0'}).data['count'], 1)

    def test_unauthenticated_rejected(self):
        self.client.credentials()
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_401_UNAUTHORIZED)

    # Validation
    def test_invalid_query_parameters_rejected(self):
        cases = {
            'bad status': ({'status': 'DONE'}, 'status'),
            'bad min': ({'min_amount': 'abc'}, 'min_amount'),
            'negative min': ({'min_amount': '-1'}, 'min_amount'),
            'bad max': ({'max_amount': '1e999'}, 'max_amount'),
            'too many decimals': ({'min_amount': '1.001'}, 'min_amount'),
            'min > max': ({'min_amount': '500', 'max_amount': '100'}, 'min_amount'),
            'bad date': ({'date_from': '2026-13-01'}, 'date_from'),
            'wrong date format': ({'date_to': '01/03/2026'}, 'date_to'),
            'from > to': ({'date_from': '2026-04-01', 'date_to': '2026-03-01'}, 'date_from'),
        }
        for label, (params, field) in cases.items():
            with self.subTest(label):
                response = self.client.get(URL, params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_equal_bounds_allowed(self):
        response = self.client.get(URL, {'min_amount': '500', 'max_amount': '500',
                                         'date_from': '2026-03-20', 'date_to': '2026-03-20'})
        self.assertEqual(self.refs(response), [self.a3.reference])


# 8. CSV export
class TransactionCSVExportTests(PaymentFactoryMixin, TestCase):
    CHANGELIST = '/admin/payments/payment/'

    def setUp(self):
        self.admin_user = User.objects.create_superuser(username='admin', password='admin-pass-123')
        self.alice = User.objects.create_user(username='alice', password='test-pass-123')
        card = self.make_card(self.alice)
        self.p1 = self.make_payment(self.alice, card, '250.00', 'SUCCESS', at(2026, 3, 1))
        self.p2 = self.make_payment(self.alice, card, '15000.00', 'FAILED', at(2026, 3, 2),
                                    description='=HYPERLINK("http://evil")')
        self.client.force_login(self.admin_user)

    def export(self, payments):
        return self.client.post(self.CHANGELIST, {
            'action': 'export_as_csv',
            '_selected_action': [p.pk for p in payments],
        })

    def rows(self, response):
        return list(csv.reader(io.StringIO(response.content.decode('utf-8'))))

    def test_csv_export(self):
        response = self.export([self.p1, self.p2])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertRegex(response['Content-Disposition'], r'attachment; filename="transactions-\d{8}-\d{6}\.csv"')

        rows = self.rows(response)
        self.assertEqual(rows[0], [name for name, _ in CSV_COLUMNS])
        self.assertEqual(len(rows), 3)
        by_ref = {r[0]: dict(zip(rows[0], r)) for r in rows[1:]}
        self.assertEqual(by_ref[self.p1.reference]['masked_card'], '**** **** **** 1111')
        self.assertEqual(by_ref[self.p1.reference]['amount'], '250.00')
        self.assertEqual(by_ref[self.p1.reference]['username'], 'alice')
        self.assertEqual(by_ref[self.p2.reference]['status'], 'FAILED')

    def test_csv_exports_only_selected(self):
        rows = self.rows(self.export([self.p1]))
        self.assertEqual([r[0] for r in rows[1:]], [self.p1.reference])

    def test_csv_contains_no_sensitive_data(self):
        body = self.export([self.p1, self.p2]).content.decode('utf-8')
        header = body.splitlines()[0].lower()

        for column in ('cvv', 'cvc', 'card_number', 'password', 'token', 'jwt', 'secret', 'email'):
            self.assertNotIn(column, header)
        # No password hashes, full card numbers or JWTs anywhere in the file.
        self.assertNotIn(self.alice.password, body)
        self.assertNotIn(self.admin_user.password, body)
        self.assertNotIn('pbkdf2', body)
        self.assertNotRegex(body, r'\b\d{13,19}\b')
        self.assertNotRegex(body, r'eyJ[\w-]+\.[\w-]+\.[\w-]+')

    def test_csv_neutralises_formula_injection(self):
        rows = self.rows(self.export([self.p2]))
        description = dict(zip(rows[0], rows[1]))['description']
        self.assertEqual(description, '\'=HYPERLINK("http://evil")')

    def test_non_staff_cannot_export(self):
        self.client.force_login(self.alice)

        response = self.export([self.p1])

        self.assertEqual(response.status_code, 302)
        self.assertIn('/admin/login/', response['Location'])
        self.assertNotIn('text/csv', response.get('Content-Type', ''))
