"""Test setup: runs against a separate MySQL database, never the real one.

test_credit_card_payment_db is created for the session and dropped afterwards.
Tables are built from the SQLAlchemy models (mirroring the Django schema).
"""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest

# Must be set before the app (and its engine) is imported. load_dotenv does not
# override variables that are already set.
os.environ['DB_NAME'] = 'test_credit_card_payment_db'

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app import database  # noqa: E402
from app.auth import JWT_ALGORITHM, JWT_SECRET_KEY  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AuthUser, Card  # noqa: E402

TEST_DB = os.environ['DB_NAME']


@pytest.fixture(scope='session', autouse=True)
def test_database():
    # Connect without the test DB (it may not exist yet). information_schema is
    # readable by every user; URL.set(database=None) would keep the old name.
    server_url = database.DATABASE_URL.set(database='information_schema')
    server = create_engine(server_url)
    with server.begin() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS `{TEST_DB}`'))
        conn.execute(text(f'CREATE DATABASE `{TEST_DB}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'))
    database.Base.metadata.create_all(database.engine)
    yield
    database.engine.dispose()
    with server.begin() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS `{TEST_DB}`'))
    server.dispose()


# Users that exist (and are active) in every test; tokens are issued for these ids.
TEST_USER_IDS = (101, 202)


@pytest.fixture(autouse=True)
def clean_tables():
    with database.engine.begin() as conn:
        conn.execute(AuthUser.__table__.insert(), [{'id': uid, 'is_active': True} for uid in TEST_USER_IDS])
    yield
    with database.engine.begin() as conn:
        for table in reversed(database.Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def db():
    session = database.SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def make_token(user_id, token_type='access', expires_in=timedelta(minutes=5)):
    """Build a token in the same format djangorestframework-simplejwt issues."""
    now = datetime.now(UTC)
    payload = {
        'token_type': token_type,
        'exp': now + expires_in,
        'iat': now,
        'jti': uuid.uuid4().hex,
        'user_id': str(user_id),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def auth(user_id):
    return {'Authorization': f'Bearer {make_token(user_id)}'}


@pytest.fixture
def make_card(db):
    def _make(user_id, last4='1111', card_type='visa', expiry_month=12, expiry_year=None):
        card = Card(
            user_id=user_id,
            cardholder_name='Test User',
            masked_number=f'**** **** **** {last4}',
            last4=last4,
            card_type=card_type,
            expiry_month=expiry_month,
            expiry_year=expiry_year or datetime.now(UTC).year + 2,
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        db.add(card)
        db.commit()
        return card

    return _make
