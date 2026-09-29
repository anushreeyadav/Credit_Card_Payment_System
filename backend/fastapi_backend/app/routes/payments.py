"""Payment routes: simulated payment processing (no real gateway)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import simulator
from ..auth import get_current_user
from ..database import get_db
from ..models import Card, Payment, PaymentStatus
from ..schemas import CardOut, CurrentUser, ErrorResponse, PaymentCreate, PaymentOut, ValidationErrorResponse

router = APIRouter(prefix='/api/payments', tags=['Payments'])

_AUTH_RESPONSES = {
    401: {
        'model': ErrorResponse,
        'description': 'Missing, invalid or expired access token, a refresh token used instead of an access '
        'token, or the account has been deactivated.',
        'content': {'application/json': {'example': {'detail': 'Authentication credentials were not provided.'}}},
    },
}
_VALIDATION_RESPONSE = {
    422: {'model': ValidationErrorResponse, 'description': 'Missing or invalid fields. Submitted values are not echoed back.'},
}


def _new_reference() -> str:
    return f'PAY-{uuid.uuid4().hex[:24].upper()}'


@router.get(
    '/cards',
    response_model=list[CardOut],
    summary="List the current user's saved cards",
    description="Masked card data only. Use a card's `id` as `card_id` in **Make a payment**. Cards are added and deleted through the Django API (`/api/cards/`).",
    responses=_AUTH_RESPONSES,
)
def list_my_cards(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Card)
        .where(Card.user_id == user.user_id)
        .order_by(Card.created_at.desc(), Card.id.desc())
    )
    return db.scalars(stmt).all()


@router.post(
    '/',
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
    summary='Make a payment with a saved card (simulated)',
    description=(
        'Creates a payment for one of your saved cards and processes it through a '
        '**simulated** gateway. No real money moves.\n\n'
        'The payment is first saved as `PENDING`, then updated to `SUCCESS` or `FAILED`. '
        'The final state is returned with HTTP 201 either way; check `status`.\n\n'
        '**Simulation rules (deterministic):**\n'
        '- `FAILED` "Card has expired." - the saved card is past its expiry month\n'
        f'- `FAILED` "Insufficient funds." - amount is above {simulator.SIMULATED_CARD_LIMIT}\n'
        '- `SUCCESS` - otherwise\n\n'
        'Send only `card_id` - never a card number or CVV. Unknown fields are rejected with 422, '
        'and so is a note that contains a card number.'
    ),
    responses={
        201: {'description': 'Payment created and processed. `status` is `SUCCESS` or `FAILED`.'},
        **_AUTH_RESPONSES,
        404: {
            'model': ErrorResponse,
            'description': 'Card not found, or it belongs to another user (indistinguishable on purpose).',
            'content': {'application/json': {'example': {'detail': 'Card not found.'}}},
        },
        **_VALIDATION_RESPONSE,
    },
)
def create_payment(
    payload: PaymentCreate,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Another user's card gives the same 404 as a missing one, so card ids
    # belonging to other users cannot be discovered.
    card = db.scalar(select(Card).where(Card.id == payload.card_id, Card.user_id == user.user_id))
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Card not found.')

    # 1. Record the payment as PENDING and commit, so it exists even if
    #    processing fails part-way.
    payment = Payment(
        reference=_new_reference(),
        user_id=user.user_id,
        card_id=card.id,
        card_last4=card.last4,
        card_type=card.card_type,
        amount=payload.amount,
        currency=payload.currency,
        description=payload.description,
        status=PaymentStatus.PENDING,
        failure_reason='',
    )
    db.add(payment)
    db.commit()

    # 2. Process through the simulated gateway and record the outcome.
    final_status, failure_reason = simulator.simulate_payment(card, payment.amount)
    payment.status = final_status
    payment.failure_reason = failure_reason
    db.commit()

    return PaymentOut.from_payment(payment)


@router.get(
    '/{reference}',
    response_model=PaymentOut,
    summary='Get one of your payments by reference',
    description="Only your own payments. Another user's reference returns 404.",
    responses={
        **_AUTH_RESPONSES,
        404: {
            'model': ErrorResponse,
            'description': 'Payment not found, or it belongs to another user.',
            'content': {'application/json': {'example': {'detail': 'Payment not found.'}}},
        },
        **_VALIDATION_RESPONSE,
    },
)
def get_payment(
    reference: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = db.scalar(
        select(Payment).where(Payment.reference == reference, Payment.user_id == user.user_id)
    )
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Payment not found.')
    return PaymentOut.from_payment(payment)
