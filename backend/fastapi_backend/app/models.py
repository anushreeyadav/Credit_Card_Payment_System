"""SQLAlchemy models.

The schema is owned by Django migrations. These classes only map existing
tables; FastAPI never creates or alters tables (no Base.metadata.create_all
outside the test suite).
"""

import enum
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, SmallInteger, String
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    # Django (USE_TZ=True) stores naive UTC datetimes in MySQL; match that.
    return datetime.now(UTC).replace(tzinfo=None)


class AuthUser(Base):
    """Read-only view of Django's auth_user table: just enough to check that a
    token's user still exists and is active. No password or profile columns."""

    __tablename__ = 'auth_user'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean)


class Card(Base):
    """Read-only view of Django's cards_card table (masked data only)."""

    __tablename__ = 'cards_card'

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    cardholder_name: Mapped[str] = mapped_column(String(100))
    masked_number: Mapped[str] = mapped_column(String(19))
    last4: Mapped[str] = mapped_column(String(4))
    card_type: Mapped[str] = mapped_column(String(20))
    expiry_month: Mapped[int] = mapped_column(SmallInteger)
    expiry_year: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class PaymentStatus(enum.StrEnum):
    PENDING = 'PENDING'
    SUCCESS = 'SUCCESS'
    FAILED = 'FAILED'


class Payment(Base):
    """Maps Django's payments_payment table. Written by this service."""

    __tablename__ = 'payments_payment'

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    card_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    card_last4: Mapped[str] = mapped_column(String(4))
    card_type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3))
    description: Mapped[str] = mapped_column(String(255), default='')
    status: Mapped[str] = mapped_column(String(10), default=PaymentStatus.PENDING)
    failure_reason: Mapped[str] = mapped_column(String(255), default='')
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6), default=utcnow, onupdate=utcnow)
