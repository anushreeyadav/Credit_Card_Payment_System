# Django REST API, served by gunicorn. Build context: project root.

# --- Build wheels (mysqlclient needs a compiler and MySQL client headers) ---
FROM python:3.14-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential pkg-config default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY backend/django_backend/requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# --- Runtime ---
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends libmariadb3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app
WORKDIR /app
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

COPY backend/django_backend/ .
COPY docker/django-entrypoint.sh /usr/local/bin/django-entrypoint.sh
COPY docker/healthcheck.py /usr/local/bin/healthcheck.py

# Collect static files (Django admin, Swagger UI) for WhiteNoise. Settings need
# these variables to import; the values are placeholders used only in this
# build step and are not kept in the image.
RUN DJANGO_SECRET_KEY=collectstatic-only JWT_SECRET_KEY=collectstatic-only \
    DB_NAME=unused DB_USER=unused DB_PASSWORD=unused \
    python manage.py collectstatic --noinput \
    && chmod 755 /usr/local/bin/django-entrypoint.sh

USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
    CMD ["python", "/usr/local/bin/healthcheck.py", "http://localhost:8000/api/auth/me/", "401"]
ENTRYPOINT ["/usr/local/bin/django-entrypoint.sh"]
