"""Start Django for browser (e2e) tests against a throwaway database.

Run with the Django backend's venv Python. Recreates test_credit_card_payment_db,
applies migrations, then serves on 127.0.0.1:8000. The real database is never
touched. Used by playwright.config.js; `--drop` removes the test database.
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / 'backend' / 'django_backend'
TEST_DB = 'test_credit_card_payment_db'

sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from dotenv import load_dotenv  # noqa: E402

# Values set here win: load_dotenv does not override existing variables.
os.environ['DB_NAME'] = TEST_DB
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
load_dotenv(BACKEND / '.env')

import MySQLdb  # noqa: E402


def server_connection():
    return MySQLdb.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('DB_PORT', '3306')),
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
    )


def recreate_database():
    conn = server_connection()
    with conn.cursor() as cur:
        cur.execute(f'DROP DATABASE IF EXISTS `{TEST_DB}`')
        cur.execute(f'CREATE DATABASE `{TEST_DB}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
    conn.close()


def drop_database():
    conn = server_connection()
    with conn.cursor() as cur:
        cur.execute(f'DROP DATABASE IF EXISTS `{TEST_DB}`')
    conn.close()


if __name__ == '__main__':
    if '--drop' in sys.argv:
        drop_database()
        sys.exit(0)

    recreate_database()
    import django
    from django.core.management import call_command, execute_from_command_line

    django.setup()
    call_command('migrate', verbosity=0)

    # Admin accounts for the admin tests (password generated per run by the e2e config):
    # e2e_staff is staff with no permissions; e2e_admin is a superuser.
    from django.contrib.auth import get_user_model

    User = get_user_model()
    User.objects.create_user(
        username='e2e_staff', email='e2e_staff@example.com',
        password=os.environ['E2E_STAFF_PASSWORD'], is_staff=True,
    )
    User.objects.create_superuser(
        username='e2e_admin', email='e2e_admin@example.com', password=os.environ['E2E_STAFF_PASSWORD'],
    )
    execute_from_command_line(['manage.py', 'runserver', '127.0.0.1:8000', '--noreload'])
