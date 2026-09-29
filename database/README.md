# Database

MySQL 8 (developed on 8.0, also verified on 8.4). The schema is owned by Django migrations;
the FastAPI service reads and writes the same tables.

## Final dump: `dumps/credit_card_payment_system.sql`

| Contains | Does not contain |
|---|---|
| Complete schema: 15 tables, indexes, foreign keys, CHECK constraints | User accounts or password hashes |
| `django_migrations` (35), `django_content_type` (11), `auth_permission` (44) | Sessions, refresh tokens, audit logs |
| | Cards or payments (and by design no table can hold a full card number or CVV) |

Import into a new database:

```sql
CREATE DATABASE credit_card_payment_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
```powershell
mysql -u <user> -p credit_card_payment_db < database\dumps\credit_card_payment_system.sql
cd backend\django_backend
.\venv\Scripts\python.exe manage.py migrate            # "No migrations to apply"
.\venv\Scripts\python.exe manage.py createsuperuser    # your own admin account
```

## Scripts

| Script | Does |
|---|---|
| `setup_mysql.ps1` | Creates the database and the `ccps_app` user (asks for the root password) |
| `audit_db.py` | Read-only audit: schema, users (hash check), cards, transactions, admin logs, and a scan of every text column for card numbers, CVVs, JWTs and secrets |
| `create_dump.ps1` | Writes the dump above from the local database |
| `verify_dump.ps1` | Scans the dump for secrets/card data, imports it into clean MySQL 8.0 and (if Docker is running) 8.4 databases, compares the schema with the source, and checks Django can use it |

```powershell
backend\django_backend\venv\Scripts\python.exe database\audit_db.py
powershell -ExecutionPolicy Bypass -File .\database\create_dump.ps1
powershell -ExecutionPolicy Bypass -File .\database\verify_dump.ps1
```

Other files in `dumps/` are git-ignored: dumps with real data must never be committed.
