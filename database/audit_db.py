"""Read-only audit of the application database before a dump.

Checks the schema, users, cards, transactions and admin logs, and scans every
text column of every table for card numbers, CVVs, JWTs, plaintext passwords
and the application's secrets. Prints findings; never prints secret values.

Run with the Django venv (connection settings come from backend/django_backend/.env):
    backend\\django_backend\\venv\\Scripts\\python.exe database\\audit_db.py [database_name]
"""

import os
import re
import sys
from pathlib import Path

from dotenv import dotenv_values
import MySQLdb

ROOT = Path(__file__).resolve().parents[1]
cfg = dotenv_values(ROOT / 'backend' / 'django_backend' / '.env')
db_name = sys.argv[1] if len(sys.argv) > 1 else cfg['DB_NAME']
conn = MySQLdb.connect(host=cfg.get('DB_HOST', '127.0.0.1'), port=int(cfg.get('DB_PORT', 3306)),
                       user=cfg['DB_USER'], password=cfg['DB_PASSWORD'], database=db_name, charset='utf8mb4')
cur = conn.cursor()
problems = []


def q(sql, args=None):
    cur.execute(sql, args)
    return cur.fetchall()


def luhn(digits):
    total = 0
    for i, d in enumerate(reversed(digits)):
        n = int(d)
        if i % 2:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


print(f'== Database: {db_name} (MySQL {q("SELECT VERSION()")[0][0]})')

# --- 1. Schema -----------------------------------------------------------------
tables = [r[0] for r in q('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s ORDER BY 1', [db_name])]
print(f'\n[1] Schema: {len(tables)} tables')
for t in tables:
    rows = q(f'SELECT COUNT(*) FROM `{t}`')[0][0]
    print(f'    {t:40} {rows:>6} rows')
sensitive_cols = q("""SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=%s
                      AND (COLUMN_NAME REGEXP 'cvv|cvc|security_code|card_number|^pan$|^number$')""", [db_name])
print(f'    columns that could hold a card number or CVV: {sensitive_cols or "none"}')
if sensitive_cols:
    problems.append(f'sensitive columns: {sensitive_cols}')
for table in ('cards_card', 'payments_payment'):
    cols = [r[0] for r in q('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s ORDER BY ORDINAL_POSITION', [db_name, table])]
    print(f'    {table}: {", ".join(cols)}')
checks = q("SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=%s ORDER BY 1", [db_name])
print(f'    CHECK constraints: {", ".join(c[0] for c in checks)}')

# --- 2. Users --------------------------------------------------------------------
print('\n[2] Users')
for uid, username, pw, is_su, is_staff, active in q('SELECT id, username, password, is_superuser, is_staff, is_active FROM auth_user ORDER BY id'):
    algo = pw.split('$', 1)[0] if pw else '(empty)'
    hashed = bool(re.fullmatch(r'(pbkdf2_sha256\$\d+\$[^$]+\$[A-Za-z0-9+/=]{40,}|!.*)', pw or ''))
    role = 'superuser' if is_su else 'staff' if is_staff else 'customer'
    print(f'    #{uid} {username:24} {role:9} active={bool(active)!s:5} password: {algo} ({"hashed" if hashed else "NOT A HASH"})')
    if not hashed:
        problems.append(f'user {username}: password not hashed')

# --- 3-5. Cards, transactions, admin logs -------------------------------------------
print('\n[3] Cards')
for row in q('SELECT id, user_id, card_type, masked_number, last4, expiry_month, expiry_year FROM cards_card'):
    print(f'    {row}')
    if not re.fullmatch(r'\*{4} \*{4} \*{4} \d{4}', row[3]) or not row[3].endswith(row[4]):
        problems.append(f'card {row[0]} not properly masked')
print(f'    total: {q("SELECT COUNT(*) FROM cards_card")[0][0]}')

print('\n[4] Transactions')
for row in q('SELECT status, COUNT(*), COALESCE(SUM(amount),0) FROM payments_payment GROUP BY status'):
    print(f'    {row[0]}: {row[1]} payments, total {row[2]}')
print(f'    total: {q("SELECT COUNT(*) FROM payments_payment")[0][0]}')

print('\n[5] Admin logs')
for row in q('SELECT action, COUNT(*) FROM adminlogs_adminlog GROUP BY action ORDER BY 2 DESC'):
    print(f'    {row[0]}: {row[1]}')
print(f'    audit log total: {q("SELECT COUNT(*) FROM adminlogs_adminlog")[0][0]}; '
      f'Django admin history: {q("SELECT COUNT(*) FROM django_admin_log")[0][0]}')

# --- 7-10. Scan every text value ------------------------------------------------------
print('\n[7-10] Scanning every text column for sensitive values')
secrets = {k: v for k, v in cfg.items() if k in ('DJANGO_SECRET_KEY', 'JWT_SECRET_KEY', 'DB_PASSWORD') and v}
card_re = re.compile(r'(?<![\w*])(?:\d[ -]?){12,18}\d(?![\w])')
jwt_re = re.compile(r'eyJ[\w-]+\.[\w-]+\.[\w-]+')
text_cols = q("""SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=%s
                 AND DATA_TYPE IN ('char','varchar','text','mediumtext','longtext','json','tinytext')""", [db_name])
scanned = 0
findings = {'card numbers': 0, 'CVV fields': 0, 'JWTs': 0, 'app secrets': 0}
for table, col in text_cols:
    # Refresh tokens are JWTs by design (blacklist bookkeeping); they are reported separately below.
    if table == 'token_blacklist_outstandingtoken' and col == 'token':
        continue
    for (value,) in q(f'SELECT `{col}` FROM `{table}` WHERE `{col}` IS NOT NULL'):
        scanned += 1
        text = str(value)
        for m in card_re.finditer(text):
            if luhn(re.sub(r'\D', '', m.group())):
                findings['card numbers'] += 1
                problems.append(f'card-number-like value in {table}.{col}')
        if re.search(r'"cvv"\s*:\s*"?\d', text, re.I):
            findings['CVV fields'] += 1
            problems.append(f'CVV in {table}.{col}')
        if jwt_re.search(text):
            findings['JWTs'] += 1
            problems.append(f'JWT in {table}.{col}')
        for name, secret in secrets.items():
            if secret in text:
                findings['app secrets'] += 1
                problems.append(f'{name} found in {table}.{col}')
print(f'    scanned {scanned} values in {len(text_cols)} text columns: ' + ', '.join(f'{k}={v}' for k, v in findings.items()))
tokens = q('SELECT COUNT(*) FROM token_blacklist_outstandingtoken')[0][0]
sessions = q('SELECT COUNT(*) FROM django_session')[0][0]
print(f'    refresh-token records (JWTs by design): {tokens}; Django admin sessions: {sessions}')

print('\n== RESULT: ' + ('OK - no sensitive data found' if not problems else f'{len(problems)} PROBLEM(S): ' + '; '.join(problems[:10])))
sys.exit(1 if problems else 0)
