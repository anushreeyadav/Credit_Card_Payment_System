# Screenshots

Submission screenshots of the Credit Card Payment System. All data is fake (public test card
numbers stored masked; `@example.com` addresses). Captured with Microsoft Edge at a
1440 × 900 viewport. Longer pages are captured at full height.

| # | File | Screen |
|---|---|---|
| 1 | `01-register.png` | Registration form |
| 2 | `02-login.png` | Login |
| 3 | `03-dashboard.png` | Customer dashboard (quick actions, totals, recent transactions, cards, system status) |
| 4 | `04-add-card.png` | Add card form with live brand detection (partial number only) |
| 5 | `05-saved-cards.png` | Saved cards, masked, after adding a card |
| 6 | `06-make-payment.png` | Make payment: choose a card, amount and note |
| 7 | `07-payment-success.png` | Successful payment with reference ID |
| 8 | `08-payment-failed.png` | Failed payment (simulated insufficient funds) |
| 9 | `09-transaction-history.png` | Transaction history with pagination |
| 10 | `10-transaction-filtering.png` | Filtered by status and amount range |
| 11 | `11-admin-users.png` | Admin: users |
| 12 | `12-admin-cards.png` | Admin: saved cards (masked) |
| 13 | `13-admin-transactions.png` | Admin: all transactions |
| 14 | `14-daily-payment-summary.png` | Admin: daily payment summary and last 7 days |
| 15 | `15-fastapi-swagger.png` | FastAPI Swagger UI (payment service) |
| 16 | `16-django-api-docs.png` | Django REST API documentation (Swagger UI) |

## Previous design

`previous-design/` keeps the screenshots of the first UI (top navigation bar), taken before
the redesign (sidebar layout, quick-action buttons, amount presets, status filter chips).
The main screenshots above show the current design. 14 of the 16 originals were recovered;
`02-login` and `12-admin-cards` from the first design were overwritten and could not be
recovered. `16-django-api-docs` is a JPEG copy.

## Regenerating

```powershell
cd frontend
npx playwright test -c playwright.screenshots.config.js
```

This starts throwaway servers on a fresh test database, seeds the demo data
(`e2e/seed_screenshot_data.py`), and captures all 16 screens. Before each capture it checks
that no full card number, CVV, password or JWT is on the page. Ports 5173, 8000 and 8001 must be free.

`test-runs/` holds screenshots written by the automated test suites and is git-ignored.
