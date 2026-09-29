"""Generates postman/Credit_Card_Payment_System.json and the example environment.

Edit the requests here, then run:  python postman/build_collection.py
"""
import json
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parent
DJ, FA = '{{django_base_url}}', '{{fastapi_base_url}}'
NOAUTH = {'type': 'noauth'}
CUSTOMER = {'type': 'bearer', 'bearer': [{'key': 'token', 'value': '{{access_token}}', 'type': 'string'}]}
ADMIN = {'type': 'bearer', 'bearer': [{'key': 'token', 'value': '{{admin_access_token}}', 'type': 'string'}]}

# Reusable test snippets ------------------------------------------------------
def status(code):
    return f"pm.test('Status is {code}', () => pm.response.to.have.status({code}));"

NO_SECRETS = """pm.test('No card number, CVV, password or refresh token in the response', () => {
    const body = pm.response.text();
    // 13-19 digits standing alone (digits inside a longer word, like a hex reference id, are not card numbers)
    pm.expect(body).to.not.match(/(?<![\\w*])\\d{13,19}(?!\\w)/);
    pm.expect(body.toLowerCase()).to.not.include('"cvv"');
    pm.expect(body.toLowerCase()).to.not.include('"password"');
    pm.expect(body).to.not.include('"refresh"');
    pm.expect(body).to.not.include('pbkdf2');
});"""

def error_field(field):
    return f"pm.test('Error for \"{field}\"', () => pm.expect(pm.response.json()).to.have.property('{field}'));"

def fastapi_error(field):
    return (f"pm.test('422 names the \"{field}\" field', () => "
            f"pm.expect(pm.response.json().detail.map(e => e.loc[e.loc.length - 1])).to.include('{field}'));")


def _block(lines):
    """Wrap a script in { } so its const/let names do not clash with other scripts."""
    body = '\n'.join(lines).split('\n')
    return ['{'] + ['    ' + line for line in body] + ['}']


def url(base, path, query=None):
    raw = f'{base}{path}'
    u = {'raw': raw, 'host': [base], 'path': [p for p in path.split('/') if p]}
    if query:
        u['query'] = [{'key': k, 'value': v} for k, v in query]
        u['raw'] += '?' + '&'.join(f'{k}={v}' for k, v in query)
    if path.endswith('/'):
        u['path'].append('')
    return u


def req(name, method, base, path, *, desc='', body=None, query=None, auth=None, tests=(), pre=()):
    item = {
        'name': name,
        'request': {
            'method': method,
            'header': [{'key': 'Accept', 'value': 'application/json'}],
            'url': url(base, path, query),
            'description': desc,
        },
        'event': [],
    }
    if body is not None:
        item['request']['header'].append({'key': 'Content-Type', 'value': 'application/json'})
        item['request']['body'] = {'mode': 'raw', 'raw': json.dumps(body, indent=2), 'options': {'raw': {'language': 'json'}}}
    if auth is not None:
        item['request']['auth'] = auth
    if pre:
        item['event'].append({'listen': 'prerequest', 'script': {'type': 'text/javascript', 'exec': _block(pre)}})
    item['event'].append({'listen': 'test', 'script': {'type': 'text/javascript', 'exec': _block(tests)}})
    return item


def folder(name, desc, items, auth=None):
    f = {'name': name, 'description': desc, 'item': items}
    if auth:
        f['auth'] = auth
    return f


PAY_PATH = '/api/payments/'

# Authentication ----------------------------------------------------------------
auth_items = [
    req('Register', 'POST', DJ, '/api/auth/register/', auth=NOAUTH,
        desc='Create a customer account. Does not log in. A unique username/email is generated for each run.',
        pre=["const id = 'pm_' + Date.now().toString(36);",
             "pm.collectionVariables.set('username', id);",
             "pm.collectionVariables.set('email', id + '@example.com');"],
        body={'username': '{{username}}', 'email': '{{email}}', 'first_name': 'Priya', 'last_name': 'Sharma',
              'password': '{{test_password}}', 'password_confirm': '{{test_password}}'},
        tests=[status(201),
               "pm.test('Returns the new user', () => pm.expect(pm.response.json().username).to.eql(pm.collectionVariables.get('username')));",
               "pm.test('Registering does not log in (no token)', () => pm.expect(pm.response.json()).to.not.have.property('access'));",
               NO_SECRETS]),
    req('Register - duplicate username', 'POST', DJ, '/api/auth/register/', auth=NOAUTH,
        body={'username': '{{username}}', 'email': 'other-{{email}}', 'password': '{{test_password}}', 'password_confirm': '{{test_password}}'},
        tests=[status(400), error_field('username')]),
    req('Register - weak password', 'POST', DJ, '/api/auth/register/', auth=NOAUTH,
        body={'username': '{{username}}_2', 'email': '2-{{email}}', 'password': 'password123', 'password_confirm': 'password123'},
        tests=[status(400), error_field('password'),
               "pm.test('Password is not echoed back', () => pm.expect(pm.response.text()).to.not.include('password123'));"]),
    req('Login - wrong password', 'POST', DJ, '/api/auth/login/', auth=NOAUTH,
        body={'username': '{{username}}', 'password': 'Wrong-Password-1'},
        tests=[status(401), "pm.test('Generic message', () => pm.expect(pm.response.json().detail).to.eql('Invalid username or password.'));"]),
    req('Login', 'POST', DJ, '/api/auth/login/', auth=NOAUTH,
        desc='Saves `access` into the `access_token` environment variable. The refresh token arrives as the httpOnly cookie `ccps_refresh`, which Postman stores automatically.',
        body={'username': '{{username}}', 'password': '{{test_password}}'},
        tests=[status(200),
               "const data = pm.response.json();",
               "pm.environment.set('access_token', data.access);",
               "pm.test('Access token returned', () => pm.expect(data.access.split('.')).to.have.length(3));",
               "pm.test('Refresh token only in an httpOnly cookie, not the body', () => {",
               "    pm.expect(data).to.not.have.property('refresh');",
               "    pm.expect(pm.response.headers.get('Set-Cookie') || '').to.match(/ccps_refresh=.+HttpOnly/i);",
               "});",
               NO_SECRETS]),
    req('Current user', 'GET', DJ, '/api/auth/me/', auth=CUSTOMER,
        tests=[status(200), "pm.test('Is the logged-in user', () => pm.expect(pm.response.json().username).to.eql(pm.collectionVariables.get('username')));",
               NO_SECRETS]),
    req('Current user - no token', 'GET', DJ, '/api/auth/me/', auth=NOAUTH, tests=[status(401)]),
    req('Current user - invalid token', 'GET', DJ, '/api/auth/me/',
        auth={'type': 'bearer', 'bearer': [{'key': 'token', 'value': 'not.a.valid-token', 'type': 'string'}]},
        tests=[status(401)]),
    req('Refresh access token', 'POST', DJ, '/api/auth/refresh/', auth=NOAUTH,
        desc='No body: uses the `ccps_refresh` cookie from Login. Rotates the cookie.',
        tests=[status(200), "pm.environment.set('access_token', pm.response.json().access);",
               "pm.test('New access token', () => pm.expect(pm.response.json().access.split('.')).to.have.length(3));"]),
    req('Logout', 'POST', DJ, '/api/auth/logout/', auth=NOAUTH,
        desc='Blacklists the refresh token and clears the cookie.', tests=[status(204)]),
    req('Refresh after logout', 'POST', DJ, '/api/auth/refresh/', auth=NOAUTH,
        tests=[status(401)]),
    req('Login again', 'POST', DJ, '/api/auth/login/', auth=NOAUTH,
        desc='Log back in for the rest of the collection.',
        body={'username': '{{username}}', 'password': '{{test_password}}'},
        tests=[status(200), "pm.environment.set('access_token', pm.response.json().access);"]),
]

# Cards -------------------------------------------------------------------------
card_body = lambda number, year='2030', month=12: {'card_number': number, 'cardholder_name': 'Priya Sharma',
                                                   'expiry_month': month, 'expiry_year': int(year)}
cards_items = [
    req('List cards', 'GET', DJ, '/api/cards/', tests=[status(200), "pm.test('Array', () => pm.expect(pm.response.json()).to.be.an('array'));"]),
    req('Add card (Visa test card)', 'POST', DJ, '/api/cards/',
        desc='Test card numbers only. The full number is sent once and never stored; the CVV is optional and never stored.',
        body={**card_body('4111 1111 1111 1111'), 'cvv': '123'},
        tests=[status(201), "const card = pm.response.json();", "pm.collectionVariables.set('card_id', card.id);",
               "pm.test('Masked number only', () => { pm.expect(card.masked_number).to.eql('**** **** **** 1111'); pm.expect(card.last4).to.eql('1111'); });",
               "pm.test('Brand detected', () => pm.expect(card.card_type).to.eql('visa'));",
               NO_SECRETS]),
    req('Add card (Mastercard test card)', 'POST', DJ, '/api/cards/', body=card_body('5555555555554444'),
        tests=[status(201), "pm.collectionVariables.set('second_card_id', pm.response.json().id);",
               "pm.test('Masked', () => pm.expect(pm.response.json().masked_number).to.eql('**** **** **** 4444'));"]),
    req('Add card - invalid number', 'POST', DJ, '/api/cards/', body=card_body('4111111111111112'),
        tests=[status(400), error_field('card_number'),
               "pm.test('Number not echoed', () => pm.expect(pm.response.text()).to.not.include('4111111111111112'));"]),
    req('Add card - expired', 'POST', DJ, '/api/cards/', body=card_body('4111111111111111', year='2020', month=1),
        tests=[status(400), error_field('expiry_year')]),
    req('List cards - after adding', 'GET', DJ, '/api/cards/',
        tests=[status(200), "pm.test('Two cards', () => pm.expect(pm.response.json()).to.have.length(2));", NO_SECRETS]),
    req('Delete card', 'DELETE', DJ, '/api/cards/{{second_card_id}}/', tests=[status(204)]),
    req('Delete card - not found', 'DELETE', DJ, '/api/cards/999999999/', tests=[status(404)]),
    req('List cards - no token', 'GET', DJ, '/api/cards/', auth=NOAUTH, tests=[status(401)]),
]

# Payments (FastAPI) --------------------------------------------------------------
REF = "pm.test('Reference ID', () => pm.expect(pm.response.json().reference).to.match(/^PAY-[0-9A-F]{24}$/));"
pay_items = [
    req('Health', 'GET', FA, '/health', auth=NOAUTH,
        tests=[status(200), "pm.test('Healthy', () => pm.expect(pm.response.json()).to.eql({status: 'ok', database: 'ok'}));"]),
    req('Saved cards (payment service)', 'GET', FA, '/api/payments/cards',
        tests=[status(200), "pm.test('Includes the saved card', () => pm.expect(pm.response.json().map(c => c.id)).to.include(Number(pm.collectionVariables.get('card_id'))));", NO_SECRETS]),
    req('Pay - success', 'POST', FA, PAY_PATH,
        desc='Simulated: amounts up to 10,000.00 succeed on a valid card.',
        body={'card_id': '{{card_id}}', 'amount': '250.00', 'currency': 'INR', 'description': 'Order #1001'},
        tests=[status(201), "const p = pm.response.json();", "pm.collectionVariables.set('payment_reference', p.reference);",
               "pm.test('SUCCESS', () => pm.expect(p.status).to.eql('SUCCESS'));", REF,
               "pm.test('Masked card', () => pm.expect(p.masked_card).to.eql('**** **** **** 1111'));", NO_SECRETS]),
    req('Pay - failed (insufficient funds)', 'POST', FA, PAY_PATH,
        desc='Simulated: amounts above 10,000.00 fail with "Insufficient funds."',
        body={'card_id': '{{card_id}}', 'amount': '15000.00', 'currency': 'INR'},
        tests=[status(201), "const p = pm.response.json();",
               "pm.test('FAILED with reason', () => { pm.expect(p.status).to.eql('FAILED'); pm.expect(p.failure_reason).to.eql('Insufficient funds.'); });", REF]),
    req('Get payment by reference', 'GET', FA, '/api/payments/{{payment_reference}}',
        tests=[status(200), "pm.test('Same payment', () => pm.expect(pm.response.json().reference).to.eql(pm.collectionVariables.get('payment_reference')));"]),
    req('Get payment - unknown reference', 'GET', FA, '/api/payments/PAY-DOESNOTEXIST', tests=[status(404)]),
    req('Pay - invalid amount', 'POST', FA, PAY_PATH, body={'card_id': '{{card_id}}', 'amount': '0'},
        tests=[status(422), fastapi_error('amount')]),
    req('Pay - card not found', 'POST', FA, PAY_PATH, body={'card_id': 999999999, 'amount': '10.00'},
        tests=[status(404), "pm.test('Card not found', () => pm.expect(pm.response.json().detail).to.eql('Card not found.'));"]),
    req('Pay - card number / CVV rejected', 'POST', FA, PAY_PATH,
        desc='Only card_id is accepted. Extra fields are rejected and never echoed back.',
        body={'card_id': '{{card_id}}', 'amount': '10.00', 'card_number': '4111111111111111', 'cvv': '123'},
        tests=[status(422), fastapi_error('card_number'), fastapi_error('cvv'),
               "pm.test('Values not echoed', () => pm.expect(pm.response.text()).to.not.include('4111111111111111'));"]),
    req('Pay - card number in note rejected', 'POST', FA, PAY_PATH,
        body={'card_id': '{{card_id}}', 'amount': '10.00', 'description': 'card 4111 1111 1111 1111'},
        tests=[status(422), fastapi_error('description')]),
    req('Pay - no token', 'POST', FA, PAY_PATH, auth=NOAUTH, body={'card_id': '{{card_id}}', 'amount': '10.00'},
        tests=[status(401)]),
]

# Transactions --------------------------------------------------------------------
TODAY_PRE = ["pm.collectionVariables.set('today', new Date().toISOString().slice(0, 10)); // UTC, as the API uses"]
tx_items = [
    req('List transactions', 'GET', DJ, '/api/transactions/',
        tests=[status(200), "const d = pm.response.json();",
               "pm.test('Paginated, newest first', () => { pm.expect(d.count).to.eql(2); pm.expect(d.results[0].amount).to.eql('15000.00'); });",
               "pm.test('Masked cards only', () => d.results.forEach(t => pm.expect(t.masked_card).to.eql('**** **** **** 1111')));",
               NO_SECRETS]),
    req('Filter by status', 'GET', DJ, '/api/transactions/', query=[('status', 'SUCCESS')],
        tests=[status(200), "pm.test('Only SUCCESS', () => pm.response.json().results.forEach(t => pm.expect(t.status).to.eql('SUCCESS')));"]),
    req('Filter by amount', 'GET', DJ, '/api/transactions/', query=[('min_amount', '100'), ('max_amount', '1000')],
        tests=[status(200), "pm.test('Within range', () => pm.response.json().results.forEach(t => pm.expect(Number(t.amount)).to.be.within(100, 1000)));",
               "pm.test('One match', () => pm.expect(pm.response.json().count).to.eql(1));"]),
    req('Filter by date', 'GET', DJ, '/api/transactions/', query=[('date_from', '{{today}}'), ('date_to', '{{today}}')], pre=TODAY_PRE,
        tests=[status(200), "pm.test('Both payments are from today', () => pm.expect(pm.response.json().count).to.eql(2));"]),
    req('Combined filters', 'GET', DJ, '/api/transactions/', pre=TODAY_PRE,
        query=[('status', 'FAILED'), ('min_amount', '10000'), ('date_from', '{{today}}')],
        tests=[status(200), "pm.test('Only the failed payment', () => { const d = pm.response.json(); pm.expect(d.count).to.eql(1); pm.expect(d.results[0].failure_reason).to.eql('Insufficient funds.'); });"]),
    req('Pagination', 'GET', DJ, '/api/transactions/', query=[('page_size', '1'), ('page', '1')],
        tests=[status(200), "pm.test('One per page with a next link', () => { const d = pm.response.json(); pm.expect(d.results).to.have.length(1); pm.expect(d.next).to.include('page=2'); });"]),
    req('Invalid filter', 'GET', DJ, '/api/transactions/', query=[('status', 'DONE')], tests=[status(400), error_field('status')]),
    req('List transactions - no token', 'GET', DJ, '/api/transactions/', auth=NOAUTH, tests=[status(401)]),
]

# Admin -----------------------------------------------------------------------------
admin_items = [
    req('Admin login', 'POST', DJ, '/api/auth/login/', auth=NOAUTH,
        desc='Log in as a staff/superuser account (`admin_username` / `admin_password`). Saves `admin_access_token`.',
        body={'username': '{{admin_username}}', 'password': '{{admin_password}}'},
        tests=[status(200), "pm.environment.set('admin_access_token', pm.response.json().access);",
               "pm.test('Staff account', () => pm.expect(pm.response.json().user.is_staff).to.be.true);"],
        pre=["pm.collectionVariables.set('today', new Date().toISOString().slice(0, 10));"]),
    req('Daily summary', 'GET', DJ, '/api/admin/summary/', query=[('date', '{{today}}')],
        tests=[status(200), "const s = pm.response.json();",
               "pm.test('Statistics present', () => ['total', 'success', 'failed', 'pending', 'success_rate', 'successful_amounts', 'last_7_days'].forEach(k => pm.expect(s).to.have.property(k)));",
               "pm.test('Includes this run\\'s payments', () => { pm.expect(s.success).to.be.at.least(1); pm.expect(s.failed).to.be.at.least(1); });"]),
    req('Daily summary - invalid date', 'GET', DJ, '/api/admin/summary/', query=[('date', '2026-02-30')], tests=[status(400), error_field('date')]),
    req('Users - search', 'GET', DJ, '/api/admin/users/', query=[('search', '{{username}}')],
        tests=[status(200), "const u = pm.response.json().results[0];", "pm.collectionVariables.set('user_id', u.id);",
               "pm.test('Finds the Postman user with counts', () => { pm.expect(u.username).to.eql(pm.collectionVariables.get('username')); pm.expect(u.card_count).to.eql(1); pm.expect(u.payment_count).to.eql(2); });",
               NO_SECRETS]),
    req('Deactivate user', 'PATCH', DJ, '/api/admin/users/{{user_id}}/', body={'is_active': False},
        tests=[status(200), "pm.test('Inactive', () => pm.expect(pm.response.json().is_active).to.be.false);"]),
    req('Deactivated user is locked out', 'GET', DJ, '/api/auth/me/', auth=CUSTOMER,
        desc="The customer's still-unexpired access token is refused once the account is inactive.",
        tests=[status(401)]),
    req('Reactivate user', 'PATCH', DJ, '/api/admin/users/{{user_id}}/', body={'is_active': True},
        tests=[status(200), "pm.test('Active', () => pm.expect(pm.response.json().is_active).to.be.true);"]),
    req('Cards', 'GET', DJ, '/api/admin/cards/', query=[('search', '{{username}}')],
        tests=[status(200), "pm.test('Masked card of the Postman user', () => pm.expect(pm.response.json().results[0].masked_number).to.eql('**** **** **** 1111'));", NO_SECRETS]),
    req('Transactions - search by reference', 'GET', DJ, '/api/admin/transactions/', query=[('search', '{{payment_reference}}')],
        tests=[status(200), "pm.test('Exactly that payment', () => { const d = pm.response.json(); pm.expect(d.count).to.eql(1); pm.expect(d.results[0].username).to.eql(pm.collectionVariables.get('username')); });"]),
    req('Transactions - filter', 'GET', DJ, '/api/admin/transactions/', query=[('search', '{{username}}'), ('status', 'FAILED')],
        tests=[status(200), "pm.test('One failed payment', () => pm.expect(pm.response.json().count).to.eql(1));"]),
    req('Admin logs', 'GET', DJ, '/api/admin/logs/', query=[('action', 'user_updated'), ('search', '{{username}}')],
        tests=[status(200), "pm.test('Deactivate + reactivate were logged', () => pm.expect(pm.response.json().count).to.eql(2));", NO_SECRETS]),
    req('Admin log action types', 'GET', DJ, '/api/admin/logs/actions/',
        tests=[status(200), "pm.test('Includes Admin login', () => pm.expect(pm.response.json()).to.deep.include({value: 'login', label: 'Admin login'}));"]),
    req('Admin endpoint - customer token', 'GET', DJ, '/api/admin/summary/', auth=CUSTOMER,
        desc='A signed-in customer (not staff) is refused.', tests=[status(403)]),
    req('Admin endpoint - no token', 'GET', DJ, '/api/admin/summary/', auth=NOAUTH, tests=[status(401)]),
]

collection = {
    'info': {
        '_postman_id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'ccps-postman-collection')),
        'name': 'Credit Card Payment System',
        'description': (
            'Complete API for the Credit Card Payment System: Django (auth, cards, transactions, admin) '
            'and FastAPI (payments).\n\n'
            '**Run order matters**: run the collection top to bottom (Collection Runner or Newman). Requests save '
            'ids and tokens for later ones (`access_token`, `card_id`, `payment_reference`, ...).\n\n'
            '**Environment**: import `Credit_Card_Payment_System.postman_environment.example.json`, then set '
            '`admin_username` / `admin_password` to a staff or superuser account for the Admin folder.\n\n'
            'Use test card numbers only. API docs: Django `/api/docs/`, FastAPI `/docs`.'
        ),
        'schema': 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    'auth': CUSTOMER,
    'item': [
        folder('Authentication', 'Register, log in, refresh (cookie), log out. Django.', auth_items),
        folder('Cards', 'Saved cards: add, list, delete. Stored and returned masked. Django.', cards_items),
        folder('Payments', 'Simulated payments with a saved card. FastAPI; uses the Django access token.', pay_items),
        folder('Transactions', 'Your payment history with filters and pagination. Django.', tx_items),
        folder('Admin', 'Staff-only dashboard API. Uses `admin_access_token` from "Admin login". Django.', admin_items, auth=ADMIN),
    ],
    'variable': [{'key': k, 'value': ''} for k in
                 ('username', 'email', 'card_id', 'second_card_id', 'payment_reference', 'user_id', 'today')],
}

environment = {
    'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'ccps-postman-environment')),
    'name': 'Credit Card Payment System - Local',
    'values': [
        {'key': 'django_base_url', 'value': 'http://127.0.0.1:8000', 'type': 'default', 'enabled': True},
        {'key': 'fastapi_base_url', 'value': 'http://127.0.0.1:8001', 'type': 'default', 'enabled': True},
        {'key': 'access_token', 'value': '', 'type': 'secret', 'enabled': True},
        {'key': 'admin_access_token', 'value': '', 'type': 'secret', 'enabled': True},
        {'key': 'test_password', 'value': 'Postman-Pass-2026!', 'type': 'secret', 'enabled': True},
        {'key': 'admin_username', 'value': 'admin', 'type': 'default', 'enabled': True},
        {'key': 'admin_password', 'value': '', 'type': 'secret', 'enabled': True},
    ],
    '_postman_variable_scope': 'environment',
}

OUT.mkdir(exist_ok=True)
(OUT / 'Credit_Card_Payment_System.json').write_text(json.dumps(collection, indent=2) + '\n', encoding='utf-8')
(OUT / 'Credit_Card_Payment_System.postman_environment.example.json').write_text(json.dumps(environment, indent=2) + '\n', encoding='utf-8')
total = sum(len(f['item']) for f in collection['item'])
print(f'{total} requests:', {f['name']: len(f['item']) for f in collection['item']})
