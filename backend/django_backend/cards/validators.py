"""Card number helpers.

None of these functions include the card number in any message they raise
or return, so it cannot leak into API responses or logs.
"""

import re

from django.views.decorators.debug import sensitive_variables

from .models import Card

# (card type, allowed lengths, prefix test). Checked in order, first match wins.
_CARD_RULES = [
    (Card.CardType.AMEX, {15}, lambda n: n[:2] in ('34', '37')),
    (Card.CardType.VISA, {13, 16, 19}, lambda n: n[0] == '4'),
    (
        Card.CardType.MASTERCARD,
        {16},
        lambda n: 51 <= int(n[:2]) <= 55 or 2221 <= int(n[:4]) <= 2720,
    ),
    (
        Card.CardType.DISCOVER,
        {16, 17, 18, 19},
        lambda n: n[:4] == '6011' or n[:2] == '65' or 644 <= int(n[:3]) <= 649,
    ),
    (
        Card.CardType.RUPAY,
        {16},
        lambda n: n[:2] in ('60', '81', '82') or n[:3] == '508',
    ),
]


@sensitive_variables('value', 'digits')
def normalize_card_number(value):
    """Strip spaces and dashes. Returns None if anything else is non-numeric."""
    digits = re.sub(r'[\s-]', '', value or '')
    return digits if digits.isdigit() else None


@sensitive_variables('number', 'digits')
def passes_luhn(number):
    digits = [int(d) for d in reversed(number)]
    total = sum(digits[0::2])
    for d in digits[1::2]:
        d *= 2
        total += d - 9 if d > 9 else d
    return total % 10 == 0


@sensitive_variables('number')
def detect_card_type(number):
    """Return the Card.CardType for a number, or None if unsupported/invalid length."""
    for card_type, lengths, matches in _CARD_RULES:
        if matches(number):
            return card_type if len(number) in lengths else None
    return None


def mask_last4(last4):
    return f'**** **** **** {last4}'
