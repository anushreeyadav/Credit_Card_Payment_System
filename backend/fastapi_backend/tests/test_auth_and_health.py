"""JWT verification edge cases and the health endpoint."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy.exc import OperationalError

from app.auth import JWT_ALGORITHM, JWT_SECRET_KEY
from app.database import get_db
from app.main import app

from .conftest import TEST_USER_IDS, make_token

CARDS = '/api/payments/cards'
USER = TEST_USER_IDS[0]


def bearer(token):
    return {'Authorization': f'Bearer {token}'}


def signed(payload, key=JWT_SECRET_KEY, algorithm=JWT_ALGORITHM):
    return jwt.encode(payload, key, algorithm=algorithm)


def claims(**overrides):
    now = datetime.now(UTC)
    return {'token_type': 'access', 'user_id': str(USER), 'jti': 'x', 'iat': now,
            'exp': now + timedelta(minutes=5), **overrides}


def test_valid_token_accepted(client):
    assert client.get(CARDS, headers=bearer(make_token(USER))).status_code == 200


@pytest.mark.parametrize('label, token', [
    ('non-numeric user id', lambda: signed(claims(user_id='abc'))),
    ('user id is a list', lambda: signed(claims(user_id=[1]))),
    ('missing user id', lambda: signed({k: v for k, v in claims().items() if k != 'user_id'})),
    ('missing token_type', lambda: signed({k: v for k, v in claims().items() if k != 'token_type'})),
    ('missing exp', lambda: signed({k: v for k, v in claims().items() if k != 'exp'})),
    ('wrong signing key', lambda: signed(claims(), key='x' * 64)),
    ('HS512 instead of HS256', lambda: signed(claims(), algorithm='HS512')),
    ('expired', lambda: make_token(USER, expires_in=timedelta(seconds=-1))),
    ('refresh token', lambda: make_token(USER, token_type='refresh')),
    ('not a JWT', lambda: 'abc.def.ghi'),
])
def test_invalid_tokens_rejected(client, label, token):
    response = client.get(CARDS, headers=bearer(token()))
    assert response.status_code == 401, label
    assert response.headers['www-authenticate'] == 'Bearer'


def test_wrong_scheme_rejected(client):
    assert client.get(CARDS, headers={'Authorization': f'Basic {make_token(USER)}'}).status_code == 401


def test_health_ok(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'database': 'ok'}


def test_health_reports_database_outage(client):
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise OperationalError('SELECT 1', {}, Exception('connection refused'))

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    try:
        response = client.get('/health')
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json() == {'detail': 'Database unavailable.'}
    assert 'connection refused' not in response.text  # no internals leaked


def test_api_docs_published(client):
    assert client.get('/docs').status_code == 200
    spec = client.get('/openapi.json').json()
    assert set(spec['paths']) == {'/api/payments/cards', '/api/payments/', '/api/payments/{reference}', '/health'}
    assert 'HTTPValidationError' not in spec['components']['schemas']  # only our non-echoing 422 is documented
