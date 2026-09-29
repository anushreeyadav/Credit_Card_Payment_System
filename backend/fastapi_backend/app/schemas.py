import re
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

_CARD_NUMBER = re.compile(r'(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)')


def _assume_utc(value: datetime) -> datetime:
    # Django (USE_TZ=True) stores naive UTC datetimes in MySQL.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


UTCDateTime = Annotated[datetime, AfterValidator(_assume_utc)]

MAX_PAYMENT_AMOUNT = Decimal('1000000.00')


class HealthResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={'examples': [{'status': 'ok', 'database': 'ok'}]})

    status: str
    database: str


class ErrorResponse(BaseModel):
    """Error body for 401, 404 and 503 responses."""

    model_config = ConfigDict(json_schema_extra={'examples': [{'detail': 'Card not found.'}]})

    detail: str = Field(description='Human-readable reason. Never contains submitted values.')


class ValidationErrorItem(BaseModel):
    loc: list[str | int] = Field(description='Where the problem is, e.g. ["body", "amount"].')
    msg: str
    type: str


class ValidationErrorResponse(BaseModel):
    """422 body. Submitted values are deliberately NOT echoed back (so a card
    number or CVV sent by mistake is never returned)."""

    model_config = ConfigDict(
        json_schema_extra={
            'examples': [
                {'detail': [{'loc': ['body', 'amount'], 'msg': 'Input should be greater than 0', 'type': 'greater_than'}]}
            ]
        }
    )

    detail: list[ValidationErrorItem]


class CurrentUser(BaseModel):
    user_id: int


class CardOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            'examples': [
                {
                    'id': 3, 'cardholder_name': 'Priya Sharma', 'card_type': 'visa',
                    'masked_number': '**** **** **** 1111', 'last4': '1111', 'expiry_month': 12,
                    'expiry_year': 2028, 'created_at': '2026-09-29T06:06:02.421349Z',
                }
            ]
        },
    )

    id: int = Field(description='Use this as card_id when making a payment.')
    cardholder_name: str
    card_type: str = Field(description='visa, mastercard, amex, discover or rupay.')
    masked_number: str = Field(description='Always masked. The full number is never stored.')
    last4: str
    expiry_month: int
    expiry_year: int
    created_at: UTCDateTime


class PaymentCreate(BaseModel):
    """Payment request. References a saved card by id only.

    Unknown fields are rejected, so a client cannot send a full card number
    or CVV - the request fails with 422 and nothing is stored.
    """

    model_config = ConfigDict(
        extra='forbid',
        json_schema_extra={
            'examples': [
                {'card_id': 1, 'amount': '250.00', 'currency': 'INR', 'description': 'Order #1001'},
            ]
        },
    )

    card_id: int = Field(gt=0, description='Id of one of your saved cards (from GET /api/payments/cards).')
    amount: Decimal = Field(
        gt=0,
        le=MAX_PAYMENT_AMOUNT,
        max_digits=12,
        decimal_places=2,
        description='Amount to charge, greater than 0, at most 2 decimal places.',
    )
    currency: Literal['INR', 'USD', 'EUR', 'GBP'] = 'INR'
    description: str = Field(default='', max_length=255, description='Optional note. Must not contain a card number.')

    @field_validator('description')
    @classmethod
    def no_card_numbers(cls, value: str) -> str:
        # The note is free text and is stored; refuse anything that looks like
        # a card number (13-19 digits, optionally separated by spaces/dashes).
        if _CARD_NUMBER.search(value):
            raise ValueError('Do not put card numbers in the note.')
        return value


class PaymentOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            'examples': [
                {
                    'reference': 'PAY-5EC1A6C3C08348AFB5E2609C', 'status': 'SUCCESS', 'failure_reason': '',
                    'amount': '250.00', 'currency': 'INR', 'description': 'Order #1001', 'card_id': 3,
                    'card_type': 'visa', 'masked_card': '**** **** **** 1111',
                    'created_at': '2026-09-29T06:06:02.569014Z', 'updated_at': '2026-09-29T06:06:02.579338Z',
                },
                {
                    'reference': 'PAY-4F49AC7A8F254E038827C8B4', 'status': 'FAILED', 'failure_reason': 'Insufficient funds.',
                    'amount': '15000.00', 'currency': 'INR', 'description': '', 'card_id': 3,
                    'card_type': 'visa', 'masked_card': '**** **** **** 1111',
                    'created_at': '2026-09-29T06:06:02.662576Z', 'updated_at': '2026-09-29T06:06:02.672666Z',
                },
            ]
        },
    )

    reference: str = Field(description='Transaction reference id.')
    status: Literal['PENDING', 'SUCCESS', 'FAILED']
    failure_reason: str = Field(description='Empty unless status is FAILED.')
    amount: Decimal
    currency: str
    description: str
    card_id: int | None = Field(description='Saved card used. Null if the card was later deleted.')
    card_type: str
    masked_card: str = Field(description='Masked card number, e.g. **** **** **** 1111.')
    created_at: UTCDateTime
    updated_at: UTCDateTime

    @classmethod
    def from_payment(cls, payment) -> 'PaymentOut':
        return cls(
            reference=payment.reference,
            status=payment.status,
            failure_reason=payment.failure_reason,
            amount=payment.amount,
            currency=payment.currency,
            description=payment.description,
            card_id=payment.card_id,
            card_type=payment.card_type,
            masked_card=f'**** **** **** {payment.card_last4}',
            created_at=payment.created_at,
            updated_at=payment.updated_at,
        )
