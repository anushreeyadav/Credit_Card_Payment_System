"""Brute-force protection for the Django admin login.

Failed admin logins are counted per client IP. After MAX_FAILURES within
WINDOW_SECONDS, further login attempts from that IP are refused (HTTP 429)
until the window expires. A successful login resets the counter.

Counting is by IP rather than username so an attacker cannot lock a real
administrator out by guessing their username. Uses Django's cache: in
production configure a shared cache (e.g. Redis) so all workers agree.
"""

import os

from django.core.cache import cache

MAX_FAILURES = int(os.getenv('ADMIN_LOGIN_MAX_FAILURES', '5'))
WINDOW_SECONDS = int(os.getenv('ADMIN_LOGIN_LOCKOUT_SECONDS', '900'))


def _key(request):
    return f'admin-login-failures:{request.META.get("REMOTE_ADDR", "unknown")}'


def record_failure(request):
    key = _key(request)
    cache.add(key, 0, WINDOW_SECONDS)
    try:
        cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, WINDOW_SECONDS)


def is_locked(request):
    return cache.get(_key(request), 0) >= MAX_FAILURES


def reset(request):
    cache.delete(_key(request))
