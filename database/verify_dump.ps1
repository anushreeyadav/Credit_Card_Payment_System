# Verifies database/dumps/credit_card_payment_system.sql:
#   1. scans it for secrets, credentials, card numbers, CVVs and tokens;
#   2. imports it into a clean database on the local MySQL server and checks the
#      schema matches the source exactly, Django has nothing left to migrate,
#      and the app can use it (create a user, card and payment);
#   3. if the docker compose stack is running, imports it into a clean database
#      on its MySQL 8.4 server as well.
# Clean databases are dropped afterwards. Secrets are never printed.
#
#   powershell -ExecutionPolicy Bypass -File .\database\verify_dump.ps1

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$dump = Join-Path $PSScriptRoot 'dumps\credit_card_payment_system.sql'
$djangoDir = Join-Path $root 'backend\django_backend'
$python = Join-Path $djangoDir 'venv\Scripts\python.exe'
$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail = '') {
    $results.Add([pscustomobject]@{ Check = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}
function Read-Env($path) {
    $values = @{}
    if (Test-Path $path) { foreach ($l in Get-Content $path) { if ($l -match '^([A-Z_]+)=(.+)$') { $values[$Matches[1]] = $Matches[2] } } }
    $values
}
$cfg = Read-Env "$djangoDir\.env"
$text = [IO.File]::ReadAllText($dump)

# --- 1. Scan the dump ---------------------------------------------------------------
Write-Host '=== Scanning the dump ===' -ForegroundColor Cyan
$secretNames = 'PASSWORD', 'SECRET', 'KEY'
$secrets = foreach ($file in "$djangoDir\.env", "$root\backend\fastapi_backend\.env", "$root\.env") {
    $e = Read-Env $file
    foreach ($k in $e.Keys) { if ($secretNames | Where-Object { $k -like "*$_*" }) { $e[$k] } }
}
$found = @($secrets | Where-Object { $_.Length -ge 8 -and $text.Contains($_) }).Count
Check 'no secret from any .env file (keys, DB/root/admin passwords)' ($found -eq 0) "$(@($secrets).Count) secrets checked, $found found"
Check 'no password hashes' (-not ($text -match 'pbkdf2_|argon2|bcrypt\$|\$2[aby]\$'))
Check 'no JWTs' (-not ($text -match 'eyJ[\w-]+\.[\w-]+\.'))
$pans = [regex]::Matches($text, '(?<![\w*])(?:\d[ -]?){12,18}\d(?!\w)') | Where-Object {
    $d = $_.Value -replace '\D'; $sum = 0
    for ($i = 0; $i -lt $d.Length; $i++) { $n = [int][string]$d[$d.Length - 1 - $i]; if ($i % 2) { $n *= 2; if ($n -gt 9) { $n -= 9 } }; $sum += $n }
    $sum % 10 -eq 0
}
Check 'no card numbers (13-19 digits passing Luhn)' (@($pans).Count -eq 0) "$(@($pans).Count) found"
Check 'no CVV columns or values' (-not ($text -match '(?i)`cvv`|`cvc`|"cvv"|card_number'))
$dataTables = [regex]::Matches($text, 'INSERT INTO `(\w+)`') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Check 'data only for reference tables' ((($dataTables -join ',') -eq 'auth_permission,django_content_type,django_migrations')) ($dataTables -join ', ')
Check 'no mysql.* grants, users or DEFINERs' (-not ($text -match '(?i)CREATE USER|GRANT |DEFINER=|IDENTIFIED BY'))

# --- 2. Import into a clean database on the local MySQL server ------------------------------------
Write-Host '=== Import into a clean local database ===' -ForegroundColor Cyan
$testDb = 'test_credit_card_payment_db'
$conn = "-h $($cfg['DB_HOST']) -P $($cfg['DB_PORT']) -u $($cfg['DB_USER'])"
$env:MYSQL_PWD = $cfg['DB_PASSWORD']
cmd /c "mysql $conn -e ""DROP DATABASE IF EXISTS $testDb; CREATE DATABASE $testDb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"" 2>&1"
$importOut = cmd /c "mysql $conn $testDb < ""$dump"" 2>&1"
Check 'imports into an empty MySQL 8.0 database' ($LASTEXITCODE -eq 0) $(if ($importOut) { $importOut } else { 'no errors' })

# Structural comparison through information_schema. (SHOW CREATE TABLE text can
# differ cosmetically - e.g. an explicit "CHARACTER SET utf8mb4" - depending on the
# client session that created a table, even when the definitions are identical.)
function Get-Schema($database) {
    $queries = @(
        "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA='$database' ORDER BY 1",
        "SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, COLLATION_NAME, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$database' ORDER BY 1, 2",
        "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='$database' ORDER BY 1, 2, 4",
        "SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='$database' ORDER BY 1, 2, 3",
        "SELECT CONSTRAINT_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='$database' ORDER BY 1"
    )
    ($queries | ForEach-Object { cmd /c "mysql $conn -N -e ""$_"" 2>&1" | Out-String }) -join "`n"
}
$source = Get-Schema $cfg['DB_NAME']
$same = $source -eq (Get-Schema $testDb)
$columnCount = ([regex]::Matches($source, "`n")).Count
Check 'imported schema identical to the source (tables, columns, indexes, keys, CHECKs)' $same "$columnCount definition rows compared"
$counts = cmd /c "mysql $conn -N $testDb -e ""SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$testDb'), (SELECT COUNT(*) FROM django_migrations), (SELECT COUNT(*) FROM django_content_type), (SELECT COUNT(*) FROM auth_permission), (SELECT COUNT(*) FROM auth_user)"" 2>&1"
Check 'tables and reference rows present, no users' ($counts -match '^15\s+35\s+11\s+44\s+0$') "tables, migrations, content types, permissions, users = $($counts -replace '\s+', ', ')"
$env:MYSQL_PWD = $null

# Django against the imported database.
Push-Location $djangoDir
$env:DB_NAME = $testDb
$migrate = & $python manage.py migrate --check 2>&1 | Out-String
Check 'Django: no migrations left to apply' ($LASTEXITCODE -eq 0) (($migrate.Trim() -split "`n")[-1])
# Written to a file without a byte-order mark and redirected by cmd: piping from
# PowerShell 5.1 would prepend a BOM that breaks the first Python line.
$smokeFile = Join-Path $env:TEMP 'ccps_dump_smoke.py'
[IO.File]::WriteAllText($smokeFile, @'
from decimal import Decimal
from django.contrib.auth import get_user_model
from cards.models import Card
from payments.models import Payment
u = get_user_model().objects.create_user('dump_check', password='Dump-Check-2026!')
c = Card.objects.create(user=u, cardholder_name='Dump Check', masked_number='**** **** **** 1111', last4='1111', card_type='visa', expiry_month=12, expiry_year=2030)
p = Payment.objects.create(reference='PAY-DUMPCHECK', user=u, card=c, card_last4='1111', card_type='visa', amount=Decimal('10.00'))
print('SMOKE', u.pk, c.pk, p.pk, u.check_password('Dump-Check-2026!'))
'@, (New-Object System.Text.UTF8Encoding($false)))
$smoke = cmd /c """$python"" manage.py shell < ""$smokeFile"" 2>&1" | Out-String
Remove-Item -LiteralPath $smokeFile -ErrorAction SilentlyContinue
Check 'Django: can create a user, card and payment' ($smoke -match 'SMOKE 1 1 1 True') (($smoke -split "`n" | Where-Object { $_ -match 'SMOKE|Error' }) -join ' ').Trim()
$env:DB_NAME = $null
Pop-Location

$env:MYSQL_PWD = $cfg['DB_PASSWORD']
cmd /c "mysql $conn -e ""DROP DATABASE IF EXISTS $testDb;"" 2>&1"
$env:MYSQL_PWD = $null

# --- 3. Import into the docker compose MySQL 8.4 (if running) -------------------------------------
Write-Host '=== Import into a clean database on the Docker MySQL 8.4 server ===' -ForegroundColor Cyan
Push-Location $root
$mysqlContainer = docker compose ps -q mysql 2>$null
if ($mysqlContainer) {
    $docker = Read-Env "$root\.env"
    docker cp $dump "${mysqlContainer}:/tmp/import_check.sql" | Out-Null
    $script = "mysql -uroot -e 'DROP DATABASE IF EXISTS import_check; CREATE DATABASE import_check CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;' && mysql -uroot import_check < /tmp/import_check.sql && mysql -uroot -N import_check -e 'SELECT VERSION(), (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()), (SELECT COUNT(*) FROM django_migrations), (SELECT COUNT(*) FROM auth_permission)'; status=`$?; mysql -uroot -e 'DROP DATABASE IF EXISTS import_check'; rm -f /tmp/import_check.sql; exit `$status"
    $out = docker compose exec -T -e "MYSQL_PWD=$($docker['MYSQL_ROOT_PASSWORD'])" mysql sh -c $script 2>&1 | Where-Object { $_ -notmatch 'Warning' }
    Check 'imports into an empty MySQL 8.4 database (Docker)' ($LASTEXITCODE -eq 0 -and "$out" -match '^8\.4\S*\s+15\s+35\s+44$') "version, tables, migrations, permissions = $("$out" -replace '\s+', ', ')"
} else {
    Write-Host '  docker compose stack not running - skipped'
}
Pop-Location

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
$failed = @($results | Where-Object Result -eq 'FAIL').Count
Write-Host "$($results.Count - $failed)/$($results.Count) checks passed"
exit $(if ($failed) { 1 } else { 0 })
