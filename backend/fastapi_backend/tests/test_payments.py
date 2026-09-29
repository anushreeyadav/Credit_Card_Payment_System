from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, inspect, select, update

from app import database, simulator
from app.models import AuthUser, Payment, PaymentStatus

from .conftest import auth, make_token

URL = '/api/payments/'
ALICE, BOB = 101, 202


def pay(client, user_id, card_id, amount='250.00', **extra):
    return client.post(URL, json={'card_id': card_id, 'amount': amount, **extra}, headers=auth(user_id))


def payment_count():
    with database.SessionLocal() as s:
        return s.scalar(select(func.count()).select_from(Payment))


# 1. Successful payment
def test_successful_payment(client, make_card, db):
    card = make_card(ALICE)

    r = pay(client, ALICE, card.id, amount='250.00', currency='INR', description='Order #1')

    assert r.status_code == 201
    body = r.json()
    assert body['status'] == 'SUCCESS'
    assert body['failure_reason'] == ''
    assert Decimal(body['amount']) == Decimal('250.00')
    assert body['currency'] == 'INR'
    assert body['card_id'] == card.id
    assert body['masked_card'] == '**** **** **** 1111'
    assert body['reference'].startswith('PAY-')
    assert body['created_at'].endswith('Z') and body['updated_at'].endswith('Z')

    row = db.scalar(select(Payment).where(Payment.reference == body['reference']))
    assert row.user_id == ALICE
    assert row.card_id == card.id
    assert row.status == 'SUCCESS'
    assert row.amount == Decimal('250.00')
    assert row.created_at is not None and row.updated_at >= row.created_at


def test_amount_at_limit_succeeds(client, make_card):
    card = make_card(ALICE)
    r = pay(client, ALICE, card.id, amount=str(simulator.SIMULATED_CARD_LIMIT))
    assert r.json()['status'] == 'SUCCESS'


# 2. Failed payment
def test_failed_payment_insufficient_funds(client, make_card, db):
    card = make_card(ALICE)

    r = pay(client, ALICE, card.id, amount='10000.01')

    assert r.status_code == 201
    assert r.json()['status'] == 'FAILED'
    assert r.json()['failure_reason'] == 'Insufficient funds.'
    row = db.scalar(select(Payment).where(Payment.reference == r.json()['reference']))
    assert row.status == 'FAILED'


def test_failed_payment_expired_card(client, make_card):
    last_year = datetime.now(UTC).year - 1
    card = make_card(ALICE, expiry_month=1, expiry_year=last_year)

    r = pay(client, ALICE, card.id)

    assert r.status_code == 201
    assert r.json()['status'] == 'FAILED'
    assert r.json()['failure_reason'] == 'Card has expired.'


# 3. Pending state
def test_payment_is_pending_while_processing(client, make_card, monkeypatch):
    card = make_card(ALICE)
    seen = {}
    real_simulate = simulator.simulate_payment

    def observing_simulate(card_, amount):
        # Read the row from a separate connection while the gateway "runs".
        with database.SessionLocal() as s:
            seen['status'] = s.scalar(select(Payment.status))
        return real_simulate(card_, amount)

    monkeypatch.setattr(simulator, 'simulate_payment', observing_simulate)

    r = pay(client, ALICE, card.id)

    assert seen['status'] == 'PENDING'
    assert r.json()['status'] == 'SUCCESS'


def test_payment_stays_pending_if_processing_crashes(client, make_card, db, monkeypatch):
    card = make_card(ALICE)

    def broken_gateway(card_, amount):
        raise RuntimeError('simulated gateway outage')

    monkeypatch.setattr(simulator, 'simulate_payment', broken_gateway)

    r = pay(client, ALICE, card.id)

    assert r.status_code == 500
    assert db.scalar(select(Payment.status)) == PaymentStatus.PENDING


def test_get_payment_by_reference(client, make_card):
    card = make_card(ALICE)
    reference = pay(client, ALICE, card.id).json()['reference']

    r = client.get(f'{URL}{reference}', headers=auth(ALICE))

    assert r.status_code == 200
    assert r.json()['reference'] == reference
    assert r.json()['status'] == 'SUCCESS'
    assert client.get(f'{URL}{reference}', headers=auth(BOB)).status_code == 404


# 4. Invalid amount
@pytest.mark.parametrize('amount', ['0', '0.00', '-5', '-0.01', '10.001', '1000000.01', 'abc', None, ''])
def test_invalid_amount_rejected(client, make_card, amount):
    card = make_card(ALICE)

    r = pay(client, ALICE, card.id, amount=amount)

    assert r.status_code == 422
    assert any(err['loc'][-1] == 'amount' for err in r.json()['detail'])
    assert payment_count() == 0


# Missing fields
@pytest.mark.parametrize('payload', [{}, {'amount': '10.00'}, {'card_id': 1}])
def test_missing_fields_rejected(client, payload):
    r = client.post(URL, json=payload, headers=auth(ALICE))
    assert r.status_code == 422
    assert payment_count() == 0


def test_invalid_currency_rejected(client, make_card):
    card = make_card(ALICE)
    assert pay(client, ALICE, card.id, currency='XYZ').status_code == 422


# 5. Invalid card
@pytest.mark.parametrize('card_id', [999999, 0, -1, 'abc', None])
def test_invalid_card_rejected(client, card_id):
    r = client.post(URL, json={'card_id': card_id, 'amount': '10.00'}, headers=auth(ALICE))

    assert r.status_code in (404, 422)
    assert payment_count() == 0


def test_nonexistent_card_returns_404(client):
    r = pay(client, ALICE, 999999)
    assert r.status_code == 404
    assert r.json() == {'detail': 'Card not found.'}


# 6. Another user's card
def test_cannot_pay_with_another_users_card(client, make_card):
    bobs_card = make_card(BOB, last4='4444', card_type='mastercard')

    r = pay(client, ALICE, bobs_card.id)

    assert r.status_code == 404
    assert r.json() == {'detail': 'Card not found.'}
    assert payment_count() == 0


# 7. Unauthenticated request
def test_unauthenticated_rejected(client, make_card):
    card = make_card(ALICE)
    body = {'card_id': card.id, 'amount': '10.00'}

    assert client.post(URL, json=body).status_code == 401
    assert client.post(URL, json=body, headers={'Authorization': 'Bearer nonsense'}).status_code == 401
    expired = make_token(ALICE, expires_in=timedelta(seconds=-1))
    assert client.post(URL, json=body, headers={'Authorization': f'Bearer {expired}'}).status_code == 401
    refresh = make_token(ALICE, token_type='refresh')
    assert client.post(URL, json=body, headers={'Authorization': f'Bearer {refresh}'}).status_code == 401
    assert payment_count() == 0


# No sensitive data accepted, stored or echoed
def test_card_number_and_cvv_rejected_and_not_echoed(client, make_card):
    card = make_card(ALICE)
    number, cvv = '4111111111111111', '987'

    r = pay(client, ALICE, card.id, card_number=number, cvv=cvv)

    assert r.status_code == 422
    assert number not in r.text
    assert cvv not in r.text
    assert {tuple(e['loc']) for e in r.json()['detail']} == {('body', 'card_number'), ('body', 'cvv')}
    assert payment_count() == 0


def test_payment_table_has_no_sensitive_columns():
    columns = {c['name'] for c in inspect(database.engine).get_columns('payments_payment')}
    assert columns.isdisjoint({'card_number', 'number', 'pan', 'cvv', 'cvc', 'security_code'})


def test_response_has_no_sensitive_fields(client, make_card):
    card = make_card(ALICE)
    body = pay(client, ALICE, card.id).json()
    assert set(body).isdisjoint({'card_number', 'cvv', 'user_id', 'id'})


# Deactivated or deleted accounts cannot use tokens issued before the change
def test_token_of_deactivated_user_rejected(client, make_card, db):
    card = make_card(ALICE)
    db.execute(update(AuthUser).where(AuthUser.id == ALICE).values(is_active=False))
    db.commit()

    assert pay(client, ALICE, card.id).status_code == 401
    assert client.get('/api/payments/cards', headers=auth(ALICE)).status_code == 401
    assert payment_count() == 0


def test_token_of_deleted_user_rejected(client):
    assert client.get('/api/payments/cards', headers=auth(999_999)).status_code == 401


# A card number typed into the free-text note is refused, not stored
@pytest.mark.parametrize('note', ['card 4111111111111111', 'pay 4111 1111 1111 1111 now', '5555-5555-5555-4444'])
def test_card_number_in_description_rejected(client, make_card, note):
    card = make_card(ALICE)

    r = pay(client, ALICE, card.id, description=note)

    assert r.status_code == 422
    assert r.json()['detail'][0]['loc'] == ['body', 'description']
    assert '4111' not in r.text and '5555' not in r.text
    assert payment_count() == 0


def test_ordinary_description_with_numbers_allowed(client, make_card):
    card = make_card(ALICE)
    r = pay(client, ALICE, card.id, description='Order #1001, invoice 2026-09-29, ref 12345678')
    assert r.status_code == 201


def test_security_headers(client, make_card):
    make_card(ALICE)
    r = client.get('/api/payments/cards', headers=auth(ALICE))
    assert r.headers['cache-control'] == 'no-store'
    assert r.headers['x-content-type-options'] == 'nosniff'
    assert r.headers['x-frame-options'] == 'DENY'
    assert r.headers['referrer-policy'] == 'no-referrer'
