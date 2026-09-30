# Screenshots

Submission screenshots of the Credit Card Payment System. All data is fake (public test card
numbers stored masked; `@example.com` addresses). Captured with Microsoft Edge at a
1440 × 900 viewport (phone screens at 390 × 844). Longer pages are captured at full height.

| # | File | Screen |
|---|---|---|
| 1 | `01-register.png` | Registration form |
| 2 | `02-login.png` | Login |
| 3 | `03-dashboard.png` | Customer dashboard: welcome banner, statistics, quick actions, recent transactions, status chart, My Cards widget |
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
| 17 | `17-payment-analytics.png` | Payment analytics: KPIs, payments by date, status distribution, amount trend, spend by card |
| 18 | `18-transaction-details.png` | Transaction details drawer (masked card only) |
| 19 | `19-notifications.png` | Notification centre: latest payment results with "new" badges |
| 20 | `20-profile.png` | Profile: personal, account and security information |
| 21 | `21-settings.png` | Settings: account, security, notification and appearance preferences |
| 22 | `22-help-support.png` | Help & Support: searchable FAQ |
| 23 | `23-admin-dashboard.png` | Admin console dashboard: system totals, today, last 7 days |
| 24 | `24-admin-export.png` | Admin: CSV export (via the Django admin) |
| 25 | `25-mobile-dashboard.png` | Phone: dashboard with bottom navigation |
| 26 | `26-mobile-navigation.png` | Phone: navigation drawer |
| 27 | `27-dark-dashboard.png` | Dark theme: dashboard |
| 28 | `28-dark-transactions.png` | Dark theme: transaction history |

## Previous designs

The main screenshots above show the current design (fintech dashboard: sidebar with icon rail,
header with quick find, notifications and account menu, separate admin console).

- `previous-design-v2/` – the second design (first sidebar layout), all 16 screens.
- `previous-design/` – the first UI (top navigation bar). 14 of the 16 originals were recovered;
`02-login` and `12-admin-cards` from the first design were overwritten and could not be
recovered. `16-django-api-docs` is a JPEG copy.

## Regenerating

```powershell
cd frontend
npx playwright test -c playwright.screenshots.config.js
```

This starts throwaway servers on a fresh test database, seeds the demo data
(`e2e/seed_screenshot_data.py`), and captures all 28 screens. Before each capture it checks
that no full card number, CVV, password or JWT is on the page. Ports 5173, 8000 and 8001 must be free.

`test-runs/` holds screenshots written by the automated test suites and is git-ignored.
