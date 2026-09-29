# Verifies a running docker compose stack end to end.
#
#   docker compose up -d --build
#   powershell -ExecutionPolicy Bypass -File .\docker\verify.ps1
#
# Checks container health, network isolation, MySQL, every API (Postman
# collection via Newman) and the browser journey (Playwright). Secrets are read
# from .env and never printed.
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$envFile = @{}
foreach ($line in Get-Content "$root\.env") { if ($line -match '^([A-Z_]+)=(.*)$') { $envFile[$Matches[1]] = $Matches[2] } }
$port = if ($envFile['FRONTEND_PORT']) { $envFile['FRONTEND_PORT'] } else { '8080' }
$base = "http://localhost:$port"
$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail = '') {
    $results.Add([pscustomobject]@{ Check = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}
function Http($path) { cmd /c "curl.exe -s -o NUL -w %{http_code} $base$path" }

Write-Host '=== Containers ===' -ForegroundColor Cyan
$ps = docker compose ps --format '{{.Service}}|{{.State}}|{{.Health}}|{{.Ports}}'
$ps | ForEach-Object { Write-Host "  $_" }
foreach ($svc in 'mysql', 'django', 'fastapi', 'frontend') {
    $row = $ps | Where-Object { $_ -like "$svc|*" }
    Check "$svc container running and healthy" ($row -like '*|running|healthy|*') ($row -split '\|')[2]
}
$published = ($ps | Where-Object { $_ -match '0\.0\.0\.0:\d+->' }) | ForEach-Object { ($_ -split '\|')[0] }
Check 'only the frontend publishes a port' (($published -join ',') -eq 'frontend') "published: $($published -join ',')"

Write-Host '=== Network isolation ===' -ForegroundColor Cyan
$internal = docker network inspect ccps_data --format '{{.Internal}}' 2>&1
Check 'database network is internal (no host/internet route)' ($internal -eq 'true') "Internal=$internal"
$mysqlNets = docker inspect (docker compose ps -q mysql) --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
Check 'MySQL is only on the internal network' ($mysqlNets.Trim() -eq 'ccps_data') $mysqlNets.Trim()
$mysqlFromHost = cmd /c "curl.exe -s -o NUL -w %{http_code} --max-time 3 http://localhost:3306/"
Check 'MySQL not reachable from the host' ($mysqlFromHost -eq '000') "host:3306 -> $mysqlFromHost"
foreach ($p in 8000, 8001) {
    $code = cmd /c "curl.exe -s -o NUL -w %{http_code} --max-time 3 http://localhost:$p/"
    Check "API port $p not published on the host" ($code -eq '000') "-> $code"
}

Write-Host '=== MySQL ===' -ForegroundColor Cyan
$sql = "SELECT VERSION(); SELECT GROUP_CONCAT(TABLE_NAME) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$($envFile['DB_NAME'])';"
$mysqlOut = docker compose exec -T -e "MYSQL_PWD=$($envFile['DB_PASSWORD'])" mysql mysql -u $envFile['DB_USER'] -N -e $sql $envFile['DB_NAME'] 2>&1
$lines = @($mysqlOut | Where-Object { $_ -and $_ -notmatch 'Warning' })
Check 'MySQL accepts the app user (password from .env)' ($lines.Count -ge 2) "version $($lines[0])"
$tables = if ($lines.Count -ge 2) { $lines[-1] -split ',' } else { @() }
$needed = 'auth_user', 'cards_card', 'payments_payment', 'adminlogs_adminlog', 'token_blacklist_outstandingtoken', 'django_cache'
$missing = $needed | Where-Object { $tables -notcontains $_ }
Check 'Django migrations created the tables' (-not $missing) $(if ($missing) { "missing: $($missing -join ',')" } else { "$($tables.Count) tables" })

Write-Host '=== HTTP through nginx ===' -ForegroundColor Cyan
foreach ($t in @(
    @('/', '200', 'React app'), @('/login', '200', 'React route (SPA fallback)'), @('/admin', '200', 'React /admin route'),
    @('/api/auth/me/', '401', 'Django API (auth required)'), @('/api/payments/cards', '401', 'FastAPI API (auth required)'),
    @('/health', '200', 'FastAPI health'), @('/admin/login/', '200', 'Django admin'),
    @('/static/admin/css/base.css', '200', 'Django static files'), @('/docs', '200', 'FastAPI Swagger'),
    @('/api/docs/', '200', 'Django Swagger'))) {
    $code = Http $t[0]
    Check "$($t[2]) $($t[0])" ($code -eq $t[1]) "HTTP $code"
}

# Rate-limit counters live in the (shared, database) cache; reset them so repeated verification runs are not throttled.
docker compose exec -T django python manage.py shell -c "from django.core.cache import cache; cache.clear()" 2>&1 | Out-Null

Write-Host '=== API: Postman collection (Newman) ===' -ForegroundColor Cyan
$newman = cmd /c "npx --yes newman@6 run ""$root\postman\Credit_Card_Payment_System.json"" -e ""$root\postman\Credit_Card_Payment_System.postman_environment.example.json"" --env-var django_base_url=$base --env-var fastapi_base_url=$base --env-var admin_username=$($envFile['DJANGO_SUPERUSER_USERNAME']) --env-var admin_password=$($envFile['DJANGO_SUPERUSER_PASSWORD']) --reporters cli --color off 2>&1" | Out-String
$req = [regex]::Match($newman, 'requests\s*\S\s*(\d+)\s*\S\s*(\d+)')
$asr = [regex]::Match($newman, 'assertions\s*\S\s*(\d+)\s*\S\s*(\d+)')
Write-Host "  requests $($req.Groups[1].Value) (failed $($req.Groups[2].Value)), assertions $($asr.Groups[1].Value) (failed $($asr.Groups[2].Value))"
Check 'all API requests (Postman collection)' ($asr.Success -and $asr.Groups[2].Value -eq '0') "$($asr.Groups[1].Value) assertions, $($asr.Groups[2].Value) failed"

Write-Host '=== Browser journey (Playwright) ===' -ForegroundColor Cyan
docker compose exec -T django python manage.py shell -c "from django.core.cache import cache; cache.clear()" 2>&1 | Out-Null
Push-Location "$root\frontend"
$env:DOCKER_ADMIN_PASSWORD = $envFile['DJANGO_SUPERUSER_PASSWORD']
$env:DOCKER_BASE_URL = $base
$pw = cmd /c "npx playwright test -c playwright.docker.config.js 2>&1" | Out-String
$env:DOCKER_ADMIN_PASSWORD = $null; $env:DOCKER_BASE_URL = $null
Pop-Location
$pw -split "`n" | Select-String -Pattern '^\s+(ok|x|-)\s+\d|passed|failed|skipped' | ForEach-Object { Write-Host "  $($_.Line.Trim())" }
$passed = [regex]::Match($pw, '(\d+) passed').Groups[1].Value
Check 'browser journey (frontend <-> both APIs)' ($pw -match '\d+ passed' -and $pw -notmatch '\d+ failed') "$passed passed"

Write-Host '=== Data written by the journey ===' -ForegroundColor Cyan
$sql = 'SELECT (SELECT COUNT(*) FROM auth_user), (SELECT COUNT(*) FROM cards_card), (SELECT COUNT(*) FROM payments_payment), (SELECT COUNT(*) FROM cards_card WHERE masked_number NOT LIKE ''**** **** **** ____'');'
$counts = (docker compose exec -T -e "MYSQL_PWD=$($envFile['DB_PASSWORD'])" mysql mysql -u $envFile['DB_USER'] -N -e $sql $envFile['DB_NAME'] 2>&1 | Where-Object { $_ -match '^\d' }) -split '\s+'
Check 'FastAPI wrote payments to MySQL' ([int]$counts[2] -ge 4) "users=$($counts[0]) cards=$($counts[1]) payments=$($counts[2])"
Check 'only masked card numbers stored' ($counts[3] -eq '0') "$($counts[3]) unmasked rows"

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
$failed = @($results | Where-Object Result -eq 'FAIL').Count
Write-Host "$($results.Count - $failed)/$($results.Count) checks passed"
exit $(if ($failed) { 1 } else { 0 })
