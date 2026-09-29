# Usage (all servers stopped first):
#   powershell -ExecutionPolicy Bypass -File .\security\run_live_probe.ps1 -DocsOff
#
# Starts Django (DEBUG=False) + FastAPI on the throwaway e2e DB, runs probe.py,
# stops the servers, greps their logs for secrets, and drops the test DB.
param([switch]$DocsOff)
$ErrorActionPreference = 'Continue'
$root = 'C:\Credit_Card_Payment_System'
$scratch = $PSScriptRoot
$b = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$env:E2E_STAFF_PASSWORD = 'Pr0be-' + [Convert]::ToBase64String($b).Replace('/', 'x').Replace('+', 'y') + '!'
$env:DJANGO_DEBUG = 'False'
$env:DJANGO_SECURE_SSL_REDIRECT = 'False'  # probes talk plain HTTP locally
$env:JWT_ACCESS_TOKEN_LIFETIME_SECONDS = '300'
$env:THROTTLE_LOGIN_RATE = '1000/min'
$env:THROTTLE_REGISTER_RATE = '1000/min'
if ($DocsOff) { $env:ENABLE_API_DOCS = 'false'; $env:EXPECT_DOCS_OFF = '1' } else { $env:ENABLE_API_DOCS = $null; $env:EXPECT_DOCS_OFF = $null }

$dj = Start-Process "$root\backend\django_backend\venv\Scripts\python.exe" -ArgumentList "$root\frontend\e2e\django_test_server.py" -PassThru -NoNewWindow -RedirectStandardOutput "$scratch\dj_out.log" -RedirectStandardError "$scratch\dj_err.log"
$env:DB_NAME = 'test_credit_card_payment_db'
$fa = Start-Process "$root\backend\fastapi_backend\venv\Scripts\python.exe" -ArgumentList '-m','uvicorn','app.main:app','--port','8001' -WorkingDirectory "$root\backend\fastapi_backend" -PassThru -NoNewWindow -RedirectStandardOutput "$scratch\fa_out.log" -RedirectStandardError "$scratch\fa_err.log"
$env:DB_NAME = $null
for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Milliseconds 700; if ((cmd /c "curl.exe -s -o NUL -w %{http_code} http://127.0.0.1:8000/api/auth/me/") -eq '401' -and (cmd /c "curl.exe -s -o NUL -w %{http_code} http://127.0.0.1:8001/health") -eq '200') { break } }

& "$root\backend\fastapi_backend\venv\Scripts\python.exe" "$scratch\live_probe.py"
$code = $LASTEXITCODE

foreach ($p in $dj, $fa) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {} }
Get-NetTCPConnection -LocalPort 8000, 8001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop } catch {} }
Start-Sleep -Seconds 1

Write-Output "`n=== server logs: secrets / card numbers / tokens ==="
$logs = (Get-Content "$scratch\dj_out.log", "$scratch\dj_err.log", "$scratch\fa_out.log", "$scratch\fa_err.log" -Raw -ErrorAction SilentlyContinue) -join "`n"
$d = @{}; foreach ($l in Get-Content "$root\backend\django_backend\.env") { if ($l -match '^([A-Z_]+)=(.*)$') { $d[$Matches[1]] = $Matches[2] } }
$checks = [ordered]@{
  'full card numbers' = ($logs -match '4111111111111111|5555555555554444')
  'JWT tokens' = ($logs -match 'eyJ[\w-]+\.[\w-]+\.')
  'passwords' = ($logs.Contains('Probe-Pass-2026!x') -or $logs.Contains($env:E2E_STAFF_PASSWORD))
  'secret keys / DB password' = ($logs.Contains($d['DJANGO_SECRET_KEY']) -or $logs.Contains($d['JWT_SECRET_KEY']) -or $logs.Contains($d['DB_PASSWORD']))
  'tracebacks' = ($logs -match 'Traceback')
}
foreach ($k in $checks.Keys) { "{0} | Logging | no {1} in server logs" -f ($(if ($checks[$k]) { 'FAIL' } else { 'PASS' }), $k) }

# Production default: plain HTTP must redirect to HTTPS.
$env:DJANGO_SECURE_SSL_REDIRECT = $null
$dj2 = Start-Process "$root\backend\django_backend\venv\Scripts\python.exe" -ArgumentList "$root\frontend\e2e\django_test_server.py" -PassThru -NoNewWindow -RedirectStandardOutput "$scratch\dj2_out.log" -RedirectStandardError "$scratch\dj2_err.log"
for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Milliseconds 700; if ((cmd /c "curl.exe -s -o NUL -w %{http_code} http://127.0.0.1:8000/api/auth/me/") -ne '000') { break } }
$redir = cmd /c "curl.exe -s -o NUL -w ""%{http_code} %{redirect_url}"" http://127.0.0.1:8000/api/cards/"
"{0} | Production | plain HTTP redirects to HTTPS by default ({1})" -f $(if ($redir -like '301 https:*') { 'PASS' } else { 'FAIL' }), $redir
try { Stop-Process -Id $dj2.Id -Force -ErrorAction Stop } catch {}
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop } catch {} }
Start-Sleep -Seconds 1

& "$root\backend\django_backend\venv\Scripts\python.exe" "$root\frontend\e2e\django_test_server.py" --drop
$env:E2E_STAFF_PASSWORD = $null; $env:DJANGO_DEBUG = $null
exit $code

