"""Live security probes against Django (8000) + FastAPI (8001) on the e2e test DB.

Run with the FastAPI venv python (has httpx + PyJWT). Prints PASS/FAIL per check.
Secrets are read from the backend .env files and never printed.
"""
import base64
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx
import jwt

ROOT = r'C:\Credit_Card_Payment_System'
DJ = 'http://127.0.0.1:8000'
FA = 'http://127.0.0.1:8001'
PAN = '4111111111111111'
PAN2 = '5555555555554444'
PW = 'Probe-Pass-2026!x'
ORIGIN_OK = 'http://127.0.0.1:5173'
ORIGIN_BAD = 'http://evil.example'


def env(path):
    out = {}
    for line in open(path, encoding='utf-8'):
        if '=' in line and not line.startswith('#'):
            k, v = line.rstrip('\n').split('=', 1)
            out[k] = v
    return out


DJ_ENV = env(rf'{ROOT}\backend\django_backend\.env')
SECRETS = [DJ_ENV['DJANGO_SECRET_KEY'], DJ_ENV['JWT_SECRET_KEY'], DJ_ENV['DB_PASSWORD'], PW]
results = []
c = httpx.Client(timeout=20)


def check(area, name, ok, detail=''):
    results.append((area, name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'} | {area} | {name}" + (f' | {detail}' if detail and not ok else ''))


def leaks(text):
    return [s for s in SECRETS + [PAN, PAN2] if s and s in text] or (['traceback'] if 'Traceback' in text or 'File "' in text else [])


def bearer(t):
    return {'Authorization': f'Bearer {t}'}


def register(name):
    r = c.post(f'{DJ}/api/auth/register/', json={'username': name, 'email': f'{name}@example.com', 'password': PW, 'password_confirm': PW})
    assert r.status_code == 201, r.text
    return r


def login(name):
    r = c.post(f'{DJ}/api/auth/login/', json={'username': name, 'password': PW})
    assert r.status_code == 200, r.text
    return r.json()['access'], r.cookies.get('ccps_refresh')


def forge(payload, key=DJ_ENV['JWT_SECRET_KEY'], alg='HS256'):
    return jwt.encode(payload, key, algorithm=alg)


suffix = str(int(time.time()))[-6:]
A, B = f'probe_a_{suffix}', f'probe_b_{suffix}'
reg = register(A)
register(B)
ta, refresh_a = login(A)
tb, _ = login(B)
uid_a = reg.json()['id']

# ------------------------------------------------------------------ PASSWORD
body = reg.text
check('Password', 'register response has no password/hash', 'password' not in reg.json() and 'pbkdf2' not in body and PW not in body)
me = c.get(f'{DJ}/api/auth/me/', headers=bearer(ta))
check('Password', '/me has no password/hash', 'password' not in me.json() and 'pbkdf2' not in me.text)
r = c.post(f'{DJ}/api/auth/register/', json={'username': 'x' + suffix, 'email': 'x@e.com', 'password': 'password123', 'password_confirm': 'password123'})
check('Password', 'weak password rejected and not echoed', r.status_code == 400 and 'password123' not in r.text)

# ------------------------------------------------------------------ AUTHENTICATION
protected = [
    ('GET', f'{DJ}/api/auth/me/'), ('GET', f'{DJ}/api/cards/'), ('POST', f'{DJ}/api/cards/'),
    ('DELETE', f'{DJ}/api/cards/1/'), ('GET', f'{DJ}/api/transactions/'), ('GET', f'{DJ}/api/admin/summary/'),
    ('GET', f'{DJ}/api/admin/users/'), ('PATCH', f'{DJ}/api/admin/users/1/'), ('GET', f'{DJ}/api/admin/cards/'),
    ('GET', f'{DJ}/api/admin/transactions/'), ('GET', f'{DJ}/api/admin/logs/'),
    ('GET', f'{FA}/api/payments/cards'), ('POST', f'{FA}/api/payments/'), ('GET', f'{FA}/api/payments/PAY-X'),
]
now = datetime.now(timezone.utc)
base = {'token_type': 'access', 'user_id': str(uid_a), 'jti': 'x', 'iat': now, 'exp': now + timedelta(minutes=5)}
bad_tokens = {
    'no token': None,
    'garbage': 'abc.def.ghi',
    'wrong signing key': forge(base, key='not-the-real-key-' + 'x' * 40),
    'alg none': base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b'=').decode() + '.'
                + base64.urlsafe_b64encode(json.dumps({**base, 'iat': 0, 'exp': 9999999999}).encode()).rstrip(b'=').decode() + '.',
    'expired': forge({**base, 'exp': now - timedelta(seconds=5)}),
    'refresh token as access': refresh_a,
    'tampered payload': (lambda t: t.split('.')[0] + '.' + base64.urlsafe_b64encode(json.dumps({**base, 'user_id': '1', 'iat': 0, 'exp': 9999999999}).encode()).rstrip(b'=').decode() + '.' + t.split('.')[2])(ta),
    'HS512 with real key': forge(base, alg='HS512'),
}
for label, token in bad_tokens.items():
    codes = []
    for method, url in protected:
        headers = bearer(token) if token else {}
        codes.append(c.request(method, url, headers=headers, json={} if method in ('POST', 'PATCH') else None).status_code)
    check('Authentication', f'{label}: all {len(protected)} protected endpoints reject (401)', set(codes) == {401}, str(sorted(set(codes))))

# Deactivated user with a still-valid access token.
c.post(f'{DJ}/api/cards/', headers=bearer(tb), json={'card_number': PAN2, 'cardholder_name': 'Probe B', 'expiry_month': 12, 'expiry_year': now.year + 2})
tb_access, _ = login(B)
admin_access = c.post(f'{DJ}/api/auth/login/', json={'username': 'e2e_admin', 'password': os.environ['E2E_STAFF_PASSWORD']}).json()['access']
uid_b = next(u['id'] for u in c.get(f'{DJ}/api/admin/users/', headers=bearer(admin_access), params={'search': B}).json()['results'])
c.patch(f'{DJ}/api/admin/users/{uid_b}/', headers=bearer(admin_access), json={'is_active': False})
dj = c.get(f'{DJ}/api/cards/', headers=bearer(tb_access)).status_code
fa = c.get(f'{FA}/api/payments/cards', headers=bearer(tb_access)).status_code
check('Authentication', 'deactivated user: Django rejects old access token', dj == 401, str(dj))
check('Authentication', 'deactivated user: FastAPI rejects old access token', fa == 401, str(fa))
c.patch(f'{DJ}/api/admin/users/{uid_b}/', headers=bearer(admin_access), json={'is_active': True})
tb, _ = login(B)

# Logout blacklists refresh.
r = c.post(f'{DJ}/api/auth/refresh/', cookies={'ccps_refresh': refresh_a})
new_refresh = r.cookies.get('ccps_refresh')
reuse = c.post(f'{DJ}/api/auth/refresh/', cookies={'ccps_refresh': refresh_a}).status_code
check('Authentication', 'rotated-out refresh token cannot be reused', r.status_code == 200 and reuse == 401, f'{r.status_code}/{reuse}')
c.post(f'{DJ}/api/auth/logout/', cookies={'ccps_refresh': new_refresh})
check('Authentication', 'refresh token dead after logout', c.post(f'{DJ}/api/auth/refresh/', cookies={'ccps_refresh': new_refresh}).status_code == 401)
ta, _ = login(A)

# ------------------------------------------------------------------ CARD SECURITY
r = c.post(f'{DJ}/api/cards/', headers=bearer(ta), json={'card_number': PAN, 'cvv': '123', 'cardholder_name': 'Probe A', 'expiry_month': 12, 'expiry_year': now.year + 2})
card_a = r.json()['id']
check('Card', 'add-card response has no full number / cvv', PAN not in r.text and 'cvv' not in r.json() and r.json()['masked_number'] == '**** **** **** 1111')
check('Card', 'card list has no full number', PAN not in c.get(f'{DJ}/api/cards/', headers=bearer(ta)).text)
check('Card', 'FastAPI saved-cards has no full number', PAN not in c.get(f'{FA}/api/payments/cards', headers=bearer(ta)).text)
r = c.post(f'{DJ}/api/cards/', headers=bearer(ta), json={'card_number': '4111111111111112', 'cardholder_name': 'Probe A', 'expiry_month': 12, 'expiry_year': now.year + 2})
check('Card', 'invalid card number rejected, not echoed', r.status_code == 400 and '4111111111111112' not in r.text)
pay = c.post(f'{FA}/api/payments/', headers=bearer(ta), json={'card_id': card_a, 'amount': '250.00'})
check('Card', 'payment response masked', pay.status_code == 201 and PAN not in pay.text)
r = c.post(f'{FA}/api/payments/', headers=bearer(ta), json={'card_id': card_a, 'amount': '5.00', 'card_number': PAN, 'cvv': '987'})
check('Card', 'payment with card_number/cvv rejected, values not echoed', r.status_code == 422 and PAN not in r.text and '987' not in r.text)
r = c.post(f'{FA}/api/payments/', headers=bearer(ta), json={'card_id': card_a, 'amount': '5.00', 'description': f'my card is {PAN}'})
check('Card', 'card number typed into payment note is refused', r.status_code == 422 and PAN not in r.text, str(r.status_code))
ref_a = pay.json()['reference']

# ------------------------------------------------------------------ AUTHORIZATION
check('Authorization', "B cannot list A's cards", PAN[-4:] not in json.dumps([x['last4'] for x in c.get(f'{DJ}/api/cards/', headers=bearer(tb)).json()]))
check('Authorization', "B cannot delete A's card", c.delete(f'{DJ}/api/cards/{card_a}/', headers=bearer(tb)).status_code == 404)
check('Authorization', "B cannot pay with A's card", c.post(f'{FA}/api/payments/', headers=bearer(tb), json={'card_id': card_a, 'amount': '1.00'}).status_code == 404)
check('Authorization', "B cannot read A's payment", c.get(f'{FA}/api/payments/{ref_a}', headers=bearer(tb)).status_code == 404)
check('Authorization', "B's transactions exclude A's", ref_a not in c.get(f'{DJ}/api/transactions/', headers=bearer(tb), params={'page_size': 100}).text)
codes = {c.get(f'{DJ}/api/admin/{p}/', headers=bearer(ta)).status_code for p in ('summary', 'users', 'cards', 'transactions', 'logs')}
codes.add(c.patch(f'{DJ}/api/admin/users/{uid_b}/', headers=bearer(ta), json={'is_active': False}).status_code)
check('Authorization', 'customer gets 403 on every admin endpoint', codes == {403}, str(codes))

# ------------------------------------------------------------------ INPUT VALIDATION
def expect(label, method, url, token, codes_ok, headers=None, **kw):
    r = c.request(method, url, headers={**(bearer(token) if token else {}), **(headers or {})}, **kw)
    bad = leaks(r.text)
    check('Input validation', label, r.status_code in codes_ok and not bad and r.status_code < 500, f'{r.status_code} {bad}')

for amt in ['0', '-1', 'abc', '1.234', '1e309', '99999999999', '', None, 'NaN', 'Infinity']:
    expect(f'invalid amount {amt!r}', 'POST', f'{FA}/api/payments/', ta, {422}, json={'card_id': card_a, 'amount': amt})
for cid in ['abc', 0, -5, 999999999, None, 1.5, [1]]:
    expect(f'invalid card id {cid!r}', 'POST', f'{FA}/api/payments/', ta, {404, 422}, json={'card_id': cid, 'amount': '1.00'})
for path in ['abc', '-1', '99999999999999999999', '1.5']:
    expect(f'invalid card id in URL {path!r}', 'DELETE', f'{DJ}/api/cards/{path}/', ta, {404})
for ref in ['nope', "PAY-' OR '1'='1", 'x' * 5000]:
    expect(f'invalid payment reference ({len(ref)} chars)', 'GET', f'{FA}/api/payments/{ref}', ta, {404, 414})
for params in [{'date_from': '2026-13-01'}, {'date_to': 'abc'}, {'date_from': '2026-05-01', 'date_to': '2026-01-01'},
               {'status': 'DONE'}, {'status': "' OR 1=1 --"}, {'min_amount': 'abc'}, {'min_amount': '-1'},
               {'min_amount': '9', 'max_amount': '1'}]:
    expect(f'invalid transaction filter {params}', 'GET', f'{DJ}/api/transactions/', ta, {400}, params=params)
expect('invalid page', 'GET', f'{DJ}/api/transactions/', ta, {404}, params={'page': 'abc'})
expect('admin summary invalid date', 'GET', f'{DJ}/api/admin/summary/', admin_access, {400}, params={'date': '2026-02-30'})
for body in [{}, {'username': ['a'], 'password': PW}, {'username': 'a' * 10000, 'password': 'x'}, {'username': "admin' --", 'password': 'x'},
             {'username': 'e2e_admin', 'password': None}]:
    expect(f'invalid login data {str(body)[:40]}', 'POST', f'{DJ}/api/auth/login/', None, {400, 401}, json=body)
expect('malformed JSON login', 'POST', f'{DJ}/api/auth/login/', None, {400}, content='{"username": ', headers={'Content-Type': 'application/json'})
expect('malformed JSON payment', 'POST', f'{FA}/api/payments/', ta, {422}, content='{"card_id": ', headers={'Content-Type': 'application/json'})
for body in [{'username': 'bad name!', 'email': 'x@e.com', 'password': PW, 'password_confirm': PW},
             {'username': 'okname' + suffix, 'email': 'not-email', 'password': PW, 'password_confirm': PW}]:
    expect(f'invalid registration {str(body)[:40]}', 'POST', f'{DJ}/api/auth/register/', None, {400}, json=body)

# ------------------------------------------------------------------ SQL INJECTION (behavioural)
for payload in ["' OR '1'='1", "1; DROP TABLE cards_card; --", '" OR ""="', "%' --", "\\'; SELECT SLEEP(5); --"]:
    t0 = time.time()
    r = c.get(f'{DJ}/api/admin/transactions/', headers=bearer(admin_access), params={'search': payload})
    slow = time.time() - t0 > 4
    check('SQL injection', f'admin search {payload[:25]!r} treated as text', r.status_code == 200 and r.json()['count'] == 0 and not slow, f'{r.status_code} slow={slow}')
r = c.post(f'{DJ}/api/auth/login/', json={'username': "e2e_admin' OR '1'='1", 'password': "' OR '1'='1"})
check('SQL injection', 'login injection does not authenticate', r.status_code == 401)
check('SQL injection', 'tables intact after payloads', c.get(f'{DJ}/api/cards/', headers=bearer(ta)).status_code == 200)

# ------------------------------------------------------------------ CORS
for base_url, path, method in [(DJ, '/api/cards/', 'GET'), (DJ, '/api/auth/refresh/', 'POST'), (FA, '/api/payments/', 'POST')]:
    ok = c.options(f'{base_url}{path}', headers={'Origin': ORIGIN_OK, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization,content-type'})
    bad = c.options(f'{base_url}{path}', headers={'Origin': ORIGIN_BAD, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization,content-type'})
    check('CORS', f'{base_url[-4:]}{path} allows frontend origin', ok.headers.get('access-control-allow-origin') == ORIGIN_OK)
    check('CORS', f'{base_url[-4:]}{path} refuses other origins', 'access-control-allow-origin' not in bad.headers)
    check('CORS', f'{base_url[-4:]}{path} never uses wildcard *', ok.headers.get('access-control-allow-origin') != '*')
check('CORS', 'refresh endpoint rejects foreign Origin (403)', c.post(f'{DJ}/api/auth/refresh/', headers={'Origin': ORIGIN_BAD}).status_code == 403)

# ------------------------------------------------------------------ ERROR HANDLING / HEADERS
r = c.get(f'{DJ}/api/does-not-exist/')
check('Error handling', 'Django 404 in production mode has no debug page', r.status_code == 404 and 'URLconf' not in r.text and 'Traceback' not in r.text)
r = c.get(f'{FA}/does-not-exist')
check('Error handling', 'FastAPI 404 is a plain message', r.status_code == 404 and r.json() == {'detail': 'Not Found'})
for url, token in [(f'{DJ}/api/cards/', ta), (f'{DJ}/api/transactions/', ta), (f'{FA}/api/payments/cards', ta)]:
    h = c.get(url, headers=bearer(token)).headers
    check('Headers', f'{url.split("/api")[0][-4:]}{url.split(":")[2][4:]} sends Cache-Control: no-store', 'no-store' in h.get('cache-control', ''), h.get('cache-control', '(none)'))
    check('Headers', f'{url.split("/api")[0][-4:]}{url.split(":")[2][4:]} sends X-Content-Type-Options: nosniff', h.get('x-content-type-options') == 'nosniff', h.get('x-content-type-options', '(none)'))
check('Error handling', 'FastAPI /docs hidden when disabled by config',
      os.environ.get('EXPECT_DOCS_OFF') != '1' or c.get(f'{FA}/docs').status_code == 404)

passed = sum(1 for r in results if r[2])
print(f'\nTOTAL: {passed}/{len(results)} passed')
json.dump([{'area': a, 'check': n, 'ok': o, 'detail': d} for a, n, o, d in results],
          open(os.path.join(os.path.dirname(__file__), 'probe_results.json'), 'w'), indent=1)
sys.exit(0 if passed == len(results) else 1)
