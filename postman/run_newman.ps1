# Runs the Postman collection with Newman (Postman's CLI runner) against
# throwaway servers, so the real database is never touched.
#
#   powershell -ExecutionPolicy Bypass -File .\postman\run_newman.ps1
#
# Starts Django + FastAPI on test_credit_card_payment_db with a generated
# superuser (e2e_admin), runs every request in order, then stops the servers
# and drops the test database. Ports 8000 and 8001 must be free.

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$logs = Join-Path $env:TEMP 'ccps-newman'
New-Item -ItemType Directory -Force $logs | Out-Null

$bytes = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:E2E_STAFF_PASSWORD = 'Nm-' + [Convert]::ToBase64String($bytes).Replace('/', 'x').Replace('+', 'y') + '!'

$django = Start-Process "$root\backend\django_backend\venv\Scripts\python.exe" -ArgumentList "$root\frontend\e2e\django_test_server.py" `
    -PassThru -NoNewWindow -RedirectStandardOutput "$logs\django.log" -RedirectStandardError "$logs\django.err.log"
$env:DB_NAME = 'test_credit_card_payment_db'
$fastapi = Start-Process "$root\backend\fastapi_backend\venv\Scripts\python.exe" -ArgumentList '-m', 'uvicorn', 'app.main:app', '--port', '8001' `
    -WorkingDirectory "$root\backend\fastapi_backend" -PassThru -NoNewWindow -RedirectStandardOutput "$logs\fastapi.log" -RedirectStandardError "$logs\fastapi.err.log"
$env:DB_NAME = $null

for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 700
    $d = cmd /c "curl.exe -s -o NUL -w %{http_code} http://127.0.0.1:8000/api/auth/me/"
    $f = cmd /c "curl.exe -s -o NUL -w %{http_code} http://127.0.0.1:8001/health"
    if ($d -eq '401' -and $f -eq '200') { break }
}

cmd /c "npx --yes newman@6 run ""$PSScriptRoot\Credit_Card_Payment_System.json"" -e ""$PSScriptRoot\Credit_Card_Payment_System.postman_environment.example.json"" --env-var admin_username=e2e_admin --env-var admin_password=$($env:E2E_STAFF_PASSWORD) --reporters cli --color off"
$code = $LASTEXITCODE

foreach ($p in $django, $fastapi) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {} }
Get-NetTCPConnection -LocalPort 8000, 8001 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop } catch {} }
Start-Sleep -Seconds 1
& "$root\backend\django_backend\venv\Scripts\python.exe" "$root\frontend\e2e\django_test_server.py" --drop
$env:E2E_STAFF_PASSWORD = $null
exit $code
