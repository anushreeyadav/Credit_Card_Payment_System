import logging

from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from .models import Card

User = get_user_model()

# Standard public test card numbers - never real cards.
VISA = '4111111111111111'
MASTERCARD = '5555555555554444'
AMEX = '378282246310005'
CVV = '123'

LIST_URL = '/api/cards/'


def detail_url(card_id):
    return f'/api/cards/{card_id}/'


class _LogCapture(logging.Handler):
    """Collects every log record emitted while installed on the root logger."""

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.messages = []

    def emit(self, record):
        self.messages.append(self.format(record))


class CardAPITests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', password='test-pass-123')
        self.bob = User.objects.create_user(username='bob', password='test-pass-123')
        self.auth_as(self.alice)

        # Capture all logs so tests can assert the card number never appears.
        self.log_capture = _LogCapture()
        root = logging.getLogger()
        self._old_level = root.level
        root.addHandler(self.log_capture)
        root.setLevel(logging.DEBUG)

    def tearDown(self):
        root = logging.getLogger()
        root.removeHandler(self.log_capture)
        root.setLevel(self._old_level)

    def auth_as(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')

    def valid_payload(self, **overrides):
        payload = {
            'card_number': VISA,
            'cvv': CVV,
            'cardholder_name': 'Alice Smith',
            'expiry_month': 12,
            'expiry_year': timezone.localdate().year + 2,
        }
        payload.update(overrides)
        return payload

    def add_card(self, **overrides):
        return self.client.post(LIST_URL, self.valid_payload(**overrides), format='json')

    def assert_number_not_logged(self, number):
        for message in self.log_capture.messages:
            self.assertNotIn(number, message)

    # 1. Add valid card
    def test_add_valid_card(self):
        response = self.add_card()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['masked_number'], '**** **** **** 1111')
        self.assertEqual(response.data['last4'], '1111')
        self.assertEqual(response.data['card_type'], 'visa')
        self.assertEqual(response.data['cardholder_name'], 'Alice Smith')
        self.assertNotIn('card_number', response.data)
        self.assertNotIn('cvv', response.data)
        self.assertNotIn(VISA, response.content.decode())
        self.assert_number_not_logged(VISA)

    def test_detects_card_types(self):
        for number, expected_type, last4 in [
            (MASTERCARD, 'mastercard', '4444'),
            (AMEX, 'amex', '0005'),
            ('4111 1111 1111 1111', 'visa', '1111'),
            ('5555-5555-5555-4444', 'mastercard', '4444'),
        ]:
            with self.subTest(expected_type=expected_type):
                response = self.add_card(card_number=number, cvv='1234' if expected_type == 'amex' else CVV)
                self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
                self.assertEqual(response.data['card_type'], expected_type)
                self.assertEqual(response.data['last4'], last4)

    # 2-4. Verify database: only masked number + last4, no full number, no CVV
    def test_database_stores_only_masked_data(self):
        self.add_card()

        card = Card.objects.get(user=self.alice)
        self.assertEqual(card.masked_number, '**** **** **** 1111')
        self.assertEqual(card.last4, '1111')

        # Schema has no column that could hold the full number or CVV.
        columns = {f.column for f in Card._meta.concrete_fields}
        self.assertTrue(columns.isdisjoint({'card_number', 'number', 'pan', 'cvv', 'cvc', 'security_code'}))

        # Raw row check straight from MySQL: no value contains the full number or CVV.
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT * FROM {Card._meta.db_table}')
            rows = cursor.fetchall()
        self.assertEqual(len(rows), 1)
        raw_values = [str(value) for value in rows[0]]
        for value in raw_values:
            self.assertNotIn(VISA, value)
            self.assertNotEqual(value, CVV)

    # 5. View cards
    def test_list_returns_only_own_cards(self):
        self.add_card()
        self.add_card(card_number=MASTERCARD)
        self.auth_as(self.bob)
        self.add_card(card_number=AMEX, cvv='1234', cardholder_name='Bob Jones')
        self.auth_as(self.alice)

        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual({c['last4'] for c in response.data}, {'1111', '4444'})
        body = response.content.decode()
        self.assertNotIn(VISA, body)
        self.assertNotIn(MASTERCARD, body)
        for card in response.data:
            self.assertNotIn('card_number', card)
            self.assertNotIn('cvv', card)

    # 6. Delete card
    def test_delete_own_card(self):
        card_id = self.add_card().data['id']

        response = self.client.delete(detail_url(card_id))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Card.objects.filter(id=card_id).exists())

    # 7. Another user's card is rejected
    def test_cannot_delete_another_users_card(self):
        card_id = self.add_card().data['id']
        self.auth_as(self.bob)

        response = self.client.delete(detail_url(card_id))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Card.objects.filter(id=card_id).exists())

    def test_cannot_see_another_users_card(self):
        self.add_card()
        self.auth_as(self.bob)

        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    # 8. Invalid input is rejected
    def test_invalid_input_rejected(self):
        this_year = timezone.localdate().year
        today = timezone.localdate()
        last_month_year, last_month = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
        cases = {
            'bad luhn': ({'card_number': '4111111111111112'}, 'card_number'),
            'letters': ({'card_number': '4111abcd11111111'}, 'card_number'),
            'too short': ({'card_number': '411111111111'}, 'card_number'),
            'too long': ({'card_number': '41111111111111111111'}, 'card_number'),
            'unsupported type': ({'card_number': '9111111111111115'}, 'card_number'),
            'missing number': ({'card_number': ''}, 'card_number'),
            'month 0': ({'expiry_month': 0}, 'expiry_month'),
            'month 13': ({'expiry_month': 13}, 'expiry_month'),
            'past year': ({'expiry_year': this_year - 1}, 'expiry_year'),
            'too far ahead': ({'expiry_year': this_year + 21}, 'expiry_year'),
            'expired last month': ({'expiry_year': last_month_year, 'expiry_month': last_month}, 'expiry_month'),
            'cvv letters': ({'cvv': '12a'}, 'cvv'),
            'cvv too long': ({'cvv': '12345'}, 'cvv'),
            'cvv too short': ({'cvv': '12'}, 'cvv'),
            'bad name': ({'cardholder_name': 'Alice <script>'}, 'cardholder_name'),
        }
        for label, (overrides, field) in cases.items():
            with self.subTest(label):
                response = self.add_card(**overrides)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)
        self.assertEqual(Card.objects.count(), 0)

    def test_error_messages_do_not_echo_card_number(self):
        bad_number = '4111111111111112'
        response = self.add_card(card_number=bad_number)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(bad_number, response.content.decode())
        self.assert_number_not_logged(bad_number)

    def test_cvv_is_optional(self):
        payload = self.valid_payload()
        del payload['cvv']

        response = self.client.post(LIST_URL, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_client_cannot_set_read_only_fields(self):
        response = self.add_card(last4='9999', masked_number='hacked', card_type='amex')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['last4'], '1111')
        self.assertEqual(response.data['masked_number'], '**** **** **** 1111')
        self.assertEqual(response.data['card_type'], 'visa')

    # 9. Unauthenticated requests are rejected
    def test_unauthenticated_requests_rejected(self):
        card_id = self.add_card().data['id']
        self.client.credentials()

        self.assertEqual(self.client.get(LIST_URL).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.add_card().status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.delete(detail_url(card_id)).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(Card.objects.filter(id=card_id).exists())

    def test_invalid_token_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')

        self.assertEqual(self.client.get(LIST_URL).status_code, status.HTTP_401_UNAUTHORIZED)


def _with_luhn_check_digit(partial):
    """Append the digit that makes `partial` pass the Luhn check."""
    for d in '0123456789':
        digits = [int(x) for x in reversed(partial + d)]
        total = sum(digits[0::2]) + sum(sum(divmod(2 * x, 10)) for x in digits[1::2])
        if total % 10 == 0:
            return partial + d
    raise AssertionError('unreachable')


class CardValidationEdgeCaseTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='carol', password='test-pass-123')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.user)}')

    def add(self, number):
        return self.client.post(LIST_URL, {
            'card_number': number, 'cardholder_name': 'Carol King',
            'expiry_month': 1, 'expiry_year': timezone.localdate().year + 3,
        }, format='json')

    def test_luhn_valid_but_unsupported_brand(self):
        number = _with_luhn_check_digit('911111111111111')
        response = self.add(number)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['card_number'], ['Card type is not supported.'])
        self.assertNotIn(number, response.content.decode())

    def test_luhn_valid_but_wrong_length_for_brand(self):
        # Amex numbers are exactly 15 digits; a checksum-valid 16-digit "Amex" is refused.
        amex_15 = _with_luhn_check_digit('37828224631000')
        amex_16 = _with_luhn_check_digit('378282246310005')
        self.assertEqual(len(amex_15), 15)
        self.assertEqual(self.add(amex_16).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.add(amex_15).status_code, status.HTTP_201_CREATED)

    def test_supported_brands_detected(self):
        for number, brand in [
            ('4111111111111111', 'visa'), ('5555555555554444', 'mastercard'), ('2223003122003222', 'mastercard'),
            ('378282246310005', 'amex'), ('6011111111111117', 'discover'), (_with_luhn_check_digit('608000000000000'), 'rupay'),
        ]:
            with self.subTest(brand=brand, prefix=number[:4]):
                response = self.add(number)
                self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
                self.assertEqual(response.data['card_type'], brand)

    def test_no_cvv_column_or_value_ever_persisted(self):
        self.client.post(LIST_URL, {
            'card_number': '4111111111111111', 'cvv': '987', 'cardholder_name': 'Carol King',
            'expiry_month': 1, 'expiry_year': timezone.localdate().year + 3,
        }, format='json')
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM cards_card')
            columns = [col[0].lower() for col in cursor.description]
            row = cursor.fetchone()
        self.assertFalse({'cvv', 'cvc', 'card_number'} & set(columns))
        self.assertNotIn('987', [str(v) for v in row])
