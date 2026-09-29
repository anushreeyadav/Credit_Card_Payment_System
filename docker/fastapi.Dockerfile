# FastAPI payment service, served by uvicorn. Build context: project root.
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 app
WORKDIR /app

COPY backend/fastapi_backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/fastapi_backend/app ./app
COPY docker/healthcheck.py /usr/local/bin/healthcheck.py

USER app
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD ["python", "/usr/local/bin/healthcheck.py", "http://localhost:8001/health", "200"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--no-server-header"]
