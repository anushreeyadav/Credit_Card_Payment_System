#!/bin/sh
# Prepares the database, then starts gunicorn.
set -eu

python manage.py migrate --noinput

if [ "${DJANGO_CACHE_BACKEND:-}" = "database" ]; then
    python manage.py createcachetable
fi

# Optional first-run superuser. Created only if it does not exist yet;
# an existing account's password is never changed from here.
if [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
    python manage.py shell -c "
import os
from django.contrib.auth import get_user_model
User = get_user_model()
name = os.environ['DJANGO_SUPERUSER_USERNAME']
if not User.objects.filter(username=name).exists():
    User.objects.create_superuser(name, os.environ.get('DJANGO_SUPERUSER_EMAIL', ''), os.environ['DJANGO_SUPERUSER_PASSWORD'])
    print(f'Created superuser {name}')
"
fi

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --access-logfile - \
    --forwarded-allow-ips '*'
