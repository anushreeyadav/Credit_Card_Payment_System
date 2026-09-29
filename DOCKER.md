# Running with Docker

The whole system (React, Django, FastAPI and MySQL) runs with Docker Compose.

## Quick start

```powershell
cd C:\Credit_Card_Payment_System
powershell -ExecutionPolicy Bypass -File .\docker\init-env.ps1   # once: creates .env with random secrets
docker compose up -d --build                                    # first build takes a few minutes
```

Open **http://localhost:8080**.

| What | URL |
|---|---|
| App | http://localhost:8080 |
| Django admin | http://localhost:8080/admin/ |
| Django API docs | http://localhost:8080/api/docs/ |
| FastAPI docs | http://localhost:8080/docs |

The first-run admin account is `admin`. Its password is `DJANGO_SUPERUSER_PASSWORD` in `.env`.
Change it after logging in.

```powershell
docker compose ps                   # status and health
docker compose logs -f django       # logs
docker compose down                 # stop (data is kept in the mysql_data volume)
docker compose down -v              # stop and DELETE the database volume
```

## Architecture

```
                 host: localhost:8080 (the only published port)
                               |
                  +------------v-------------+
                  | frontend (nginx)          |  React build + reverse proxy
                  |  /             -> React    |  CSP, X-Frame-Options, nosniff
                  |  /api/payments/, /health,  |
                  |  /docs         -> fastapi  |
                  |  /api/, /admin/,           |
                  |  /static/      -> django   |
                  +-----+----------------+----+
                 edge   |                |   network
              +---------v----+   +-------v------+
              | django        |   | fastapi       |
              | gunicorn x3   |   | uvicorn       |
              +------+--------+   +------+--------+
                 data |  (internal)       |  network
              +------v--------------------v---+
              | mysql 8.4  (volume mysql_data) |
              +-------------------------------+
```

- **One origin.** The browser only talks to nginx, so there is no cross-origin traffic and the
  SameSite refresh cookie works unchanged. The frontend is built with API URLs set to `/`.
- **Internal networks.** `data` is `internal: true`: MySQL has no route to the host or the internet.
  Django, FastAPI and MySQL publish no ports.
- **Start order.** MySQL (healthy) → Django (runs migrations, then healthy) → FastAPI (needs the
  tables Django created) → frontend.
- **Health checks** on every container. Django: `/api/auth/me/` returns 401. FastAPI: `/health`. MySQL: `mysqladmin ping`.

## Secrets and configuration

- All secrets live in the git-ignored **`.env`** at the project root. `docker/init-env.ps1` generates
  them randomly and never overwrites an existing file. `.env.example` shows the variables.
- `docker-compose.yml` passes them to the containers as environment variables (`${VAR:?}` fails fast
  if one is missing). Nothing is hardcoded.
- `.dockerignore` keeps every `.env`, venv, `node_modules` and coverage folder out of the images.
  Checked: no `.env` file inside any image, and no secret in image environment or build history.
- Containers run as non-root users (`app` uid 10001, nginx uid 101).

## Production-like settings (and what to change for real deployment)

Django runs with `DEBUG=False`, gunicorn, WhiteNoise static files, and a database-backed cache so
rate limits and the admin lockout are shared across workers. Because this compose file serves
**plain HTTP on localhost**, it switches off four HTTPS-only settings:

```yaml
DJANGO_SECURE_SSL_REDIRECT: "False"
DJANGO_SECURE_HSTS_SECONDS: "0"
DJANGO_SECURE_COOKIES: "False"
AUTH_COOKIE_SECURE: "False"
```

For a real deployment, put a TLS-terminating proxy in front, remove those four lines, set
`DJANGO_SECURE_PROXY_SSL_HEADER=True`, set `DJANGO_NUM_PROXIES` to the number of proxies, and set
`ENABLE_API_DOCS=False`.

## Verifying the stack

```powershell
powershell -ExecutionPolicy Bypass -File .\docker\verify.ps1
```

It checks, in 26 steps:
- containers are healthy and only the frontend is published;
- the network is isolated;
- MySQL and the tables exist;
- every route through nginx works;
- all 54 Postman requests pass against `http://localhost:8080`;
- a browser journey passes (register → card → payments → history → reload → logout → admin → Django admin → API docs);
- MySQL holds the payments FastAPI wrote, with masked card numbers only.
