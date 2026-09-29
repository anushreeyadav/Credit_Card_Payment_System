# Postman collection

| File | Purpose |
|---|---|
| `Credit_Card_Payment_System.json` | The collection: 54 requests with tests, in folders **Authentication, Cards, Payments, Transactions, Admin** |
| `Credit_Card_Payment_System.postman_environment.example.json` | Environment template (no real secrets) |
| `run_newman.ps1` | Runs the whole collection from the command line against throwaway servers |
| `build_collection.py` | Generates both JSON files. Edit requests here, not in the JSON. |

## Use in Postman

1. **Import** both JSON files.
2. Select the **Credit Card Payment System - Local** environment.
3. Set `admin_password` (and `admin_username` if it's not `admin`) to a staff or superuser account. The Admin folder needs it.
4. Start Django (port 8000) and FastAPI (port 8001).
5. Run the collection **top to bottom** (Collection Runner). Requests save tokens and ids for later ones.

| Variable | Set by | Used for |
|---|---|---|
| `django_base_url` | environment | `http://127.0.0.1:8000` |
| `fastapi_base_url` | environment | `http://127.0.0.1:8001` |
| `access_token` | **Login** request | Customer requests (collection-level Bearer auth) |
| `admin_access_token` | **Admin login** request | Admin folder |
| `test_password` | environment | Password for the user the run registers |

The refresh token is an httpOnly cookie (`ccps_refresh`). Postman stores and sends it automatically for
**Refresh access token** and **Logout**.

Running the collection creates a new user, cards and payments in whichever database the servers use.
To avoid touching real data, use `run_newman.ps1`.

## Run everything from the command line

```powershell
powershell -ExecutionPolicy Bypass -File .\postman\run_newman.ps1
```

This starts Django and FastAPI on a throwaway database with a generated superuser, runs all 54 requests with
[Newman](https://www.npmjs.com/package/newman) (Postman's CLI runner), then stops the servers and drops the database.
Ports 8000 and 8001 must be free.
