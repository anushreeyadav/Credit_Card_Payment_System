"""Scrubbing for audit-log data.

Everything written to AdminLog passes through here, so a password, CVV, card
number, token or secret cannot reach the table even if a caller passes one by
mistake (for example a card number typed into an admin search box).
"""

import re

REDACTED = '[REDACTED]'
MAX_STRING = 200
MAX_ITEMS = 50

# Keys whose values are dropped entirely, whatever they contain.
_SENSITIVE_KEY = re.compile(
    r'pass|pwd|secret|token|jwt|auth|cookie|session|csrf|api_?key|private|'
    r'cvv|cvc|cvn|security_?code|card_?number|^pan$|^number$',
    re.IGNORECASE,
)
# 12-19 digits, optionally separated by spaces or dashes: a possible card number.
_CARD_NUMBER = re.compile(r'(?<!\d)(?:\d[ -]?){11,18}\d(?!\d)')
# JSON Web Tokens (header.payload.signature, base64url starting with eyJ).
_JWT = re.compile(r'eyJ[\w-]+\.[\w-]+\.[\w-]*')


def is_sensitive_key(key):
    return bool(_SENSITIVE_KEY.search(str(key)))


def scrub_text(value, max_length=MAX_STRING):
    text = str(value)
    text = _JWT.sub(REDACTED, text)
    text = _CARD_NUMBER.sub(REDACTED, text)
    return text[:max_length]


def scrub(value, _depth=0):
    """Return a JSON-safe copy of value with sensitive keys and values removed."""
    if _depth > 4:
        return REDACTED
    if isinstance(value, dict):
        return {
            str(k)[:MAX_STRING]: (REDACTED if is_sensitive_key(k) else scrub(v, _depth + 1))
            for k, v in list(value.items())[:MAX_ITEMS]
        }
    if isinstance(value, (list, tuple, set)):
        return [scrub(v, _depth + 1) for v in list(value)[:MAX_ITEMS]]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return scrub_text(value)
