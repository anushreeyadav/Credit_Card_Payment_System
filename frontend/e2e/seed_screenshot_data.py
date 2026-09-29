"""Seeds realistic fake data for the submission screenshots.

Runs against the throwaway e2e database only (DB_NAME is forced to
test_credit_card_payment_db). Passwords come from the environment and are never
printed. Card data is stored exactly as the app stores it: masked, last 4 only.
"""

import os
import random
import sys
from datetime import timedelta
from zoneinfo import ZoneInfo
from decimal import Decimal
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / 'backend' / 'django_backend'
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
os.environ['DB_NAME'] = 'test_credit_card_payment_db'
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / '.env')

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.utils import timezone  # noqa: E402

from cards.models import Card  # noqa: E402
from payments.models import Payment  # noqa: E402

User = get_user_model()
rng = random.Random(2026)  # same data every run
now = timezone.now()
IST = ZoneInfo('Asia/Kolkata')
customer_password = os.environ['SCREENSHOT_USER_PASSWORD']


def user(username, first, last, *, staff=False, superuser=False, password=customer_password):
    u = User.objects.create_user(username=username, email=f'{username.replace("_", ".")}@example.com',
                                 password=password, first_name=first, last_name=last,
                                 is_staff=staff or superuser, is_superuser=superuser)
    u.date_joined = now - timedelta(days=rng.randint(8, 40))
    u.save(update_fields=['date_joined'])
    return u


def card(owner, card_type, last4, month, year, holder=None):
    return Card.objects.create(user=owner, cardholder_name=holder or owner.get_full_name(), card_type=card_type,
                               masked_number=f'**** **** **** {last4}', last4=last4,
                               expiry_month=month, expiry_year=year)


seq = 0


def payment(owner, c, amount, status, days_ago, hour, description, reason=''):
    global seq
    seq += 1
    ref = f'PAY-{rng.getrandbits(96):024X}'
    p = Payment.objects.create(reference=ref, user=owner, card=c, card_last4=c.last4, card_type=c.card_type,
                               amount=Decimal(amount), currency='INR', description=description, status=status,
                               failure_reason=reason)
    # `hour` is a local (Indian) time of day; stored as UTC like every Django datetime.
    local_now = now.astimezone(IST)
    when = (local_now - timedelta(days=days_ago)).replace(hour=hour, minute=rng.randint(0, 59), second=rng.randint(0, 59))
    if when > local_now - timedelta(minutes=30):  # today's entries must not be in the future
        when = local_now - timedelta(minutes=rng.randint(40, 180))
    Payment.objects.filter(pk=p.pk).update(created_at=when, updated_at=when + timedelta(seconds=1))


# --- Admin -----------------------------------------------------------------------------
# The e2e server's generic test accounts are not part of the demo data.
User.objects.filter(username__in=['e2e_admin', 'e2e_staff']).delete()
User.objects.create_superuser(username='anita_admin', email='anita.rao@example.com',
                              password=os.environ['E2E_STAFF_PASSWORD'], first_name='Anita', last_name='Rao')

# --- Customers --------------------------------------------------------------------------
year = now.year
priya = user('priya_sharma', 'Priya', 'Sharma')
rahul = user('rahul_verma', 'Rahul', 'Verma')
aisha = user('aisha_khan', 'Aisha', 'Khan')
daniel = user('daniel_fernandes', 'Daniel', 'Fernandes')
meera = user('meera_iyer', 'Meera', 'Iyer')
user('arjun_mehta', 'Arjun', 'Mehta')  # registered, no cards yet
user('support_desk', 'Kavya', 'Nair', staff=True)

p_visa = card(priya, 'visa', '1111', 8, year + 3)
p_mc = card(priya, 'mastercard', '4444', 3, year + 2)
p_rupay = card(priya, 'rupay', '6012', 11, year + 4)
r_visa = card(rahul, 'visa', '4242', 6, year + 2)
a_amex = card(aisha, 'amex', '0005', 1, year + 3)
d_mc = card(daniel, 'mastercard', '8210', 9, year + 1)
m_disc = card(meera, 'discover', '1117', 12, year + 2)

FAILED = 'Insufficient funds.'
# Priya: a realistic week of payments (latest first when listed).
priya_history = [
    ('349.00', 'SUCCESS', 0, 9, 'Coffee subscription', p_visa),
    ('1,299.00', 'SUCCESS', 0, 11, 'Mobile recharge - annual', p_rupay),
    ('2,499.00', 'SUCCESS', 1, 19, 'Electricity bill - September', p_visa),
    ('18,500.00', 'FAILED', 1, 20, 'Laptop - first instalment', p_mc),
    ('640.50', 'SUCCESS', 2, 13, 'Grocery order #4821', p_mc),
    ('4,215.00', 'SUCCESS', 2, 18, 'Flight booking BLR-GOI', p_visa),
    ('899.00', 'PENDING', 3, 10, 'Streaming plan renewal', p_rupay),
    ('1,150.00', 'SUCCESS', 3, 21, 'Dinner at The Spice Route', p_mc),
    ('12,750.00', 'FAILED', 4, 16, 'Home appliance store', p_visa),
    ('7,999.00', 'SUCCESS', 4, 17, 'Home appliance store - revised', p_visa),
    ('225.00', 'SUCCESS', 5, 8, 'Metro card top-up', p_rupay),
    ('3,050.00', 'SUCCESS', 6, 12, 'Health insurance premium', p_mc),
]
for amount, status, days, hour, desc, c in priya_history:
    payment(priya, c, amount.replace(',', ''), status, days, hour, desc, FAILED if status == 'FAILED' else '')

# Other customers (for the admin views and daily summary).
others = [
    (rahul, r_visa, '5,600.00', 'SUCCESS', 0, 10, 'Rent contribution'),
    (rahul, r_visa, '14,200.00', 'FAILED', 0, 12, 'Television purchase'),
    (aisha, a_amex, '2,180.00', 'SUCCESS', 0, 14, 'Bookstore order #117'),
    (daniel, d_mc, '980.00', 'SUCCESS', 0, 15, 'Pharmacy'),
    (meera, m_disc, '1,475.00', 'SUCCESS', 1, 9, 'Yoga studio - monthly'),
    (daniel, d_mc, '11,000.00', 'FAILED', 2, 11, 'Furniture deposit'),
    (aisha, a_amex, '760.00', 'SUCCESS', 3, 16, 'Cab rides - weekly'),
    (meera, m_disc, '3,300.00', 'SUCCESS', 5, 19, 'Concert tickets'),
]
for owner, c, amount, status, days, hour, desc in others:
    payment(owner, c, amount.replace(',', ''), status, days, hour, desc, FAILED if status == 'FAILED' else '')

print(f'seeded users={User.objects.count()} cards={Card.objects.count()} payments={Payment.objects.count()}')
