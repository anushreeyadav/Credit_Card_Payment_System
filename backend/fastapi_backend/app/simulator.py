"""Simulated payment gateway. No real gateway is ever contacted.

The outcome is fully deterministic so both paths can be tested:

* FAILED - "Card has expired."   if the saved card's expiry month has passed
* FAILED - "Insufficient funds." if the amount is above SIMULATED_CARD_LIMIT
* SUCCESS                        otherwise
"""

from datetime import UTC, datetime
from decimal import Decimal

from .models import Card, PaymentStatus

SIMULATED_CARD_LIMIT = Decimal('10000.00')


def simulate_payment(card: Card, amount: Decimal) -> tuple[PaymentStatus, str]:
    """Return (final status, failure reason). The reason is '' on success."""
    today = datetime.now(UTC).date()
    if (card.expiry_year, card.expiry_month) < (today.year, today.month):
        return PaymentStatus.FAILED, 'Card has expired.'
    if amount > SIMULATED_CARD_LIMIT:
        return PaymentStatus.FAILED, 'Insufficient funds.'
    return PaymentStatus.SUCCESS, ''
