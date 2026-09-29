# Creates the application database and a dedicated MySQL user.
#
# Reads DB_NAME, DB_USER and DB_PASSWORD from backend\django_backend\.env,
# so no password is stored in this script. MySQL prompts for the root
# password; it is never saved.
#
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File .\database\setup_mysql.ps1

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\backend\django_backend\.env'
if (-not (Test-Path $envFile)) { throw ".env not found at $envFile" }

$cfg = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
}
foreach ($k in 'DB_NAME', 'DB_USER', 'DB_PASSWORD') {
    if (-not $cfg[$k]) { throw "$k is missing from .env" }
}
if ($cfg['DB_PASSWORD'] -match "['\\]") { throw "DB_PASSWORD must not contain quotes or backslashes" }

$db = $cfg['DB_NAME']
$user = $cfg['DB_USER']
$pw = $cfg['DB_PASSWORD']
# pytest-django creates a separate test database named test_<DB_NAME>.
$testDb = "test_$db"

$sql = @"
CREATE DATABASE IF NOT EXISTS ``$db`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$user'@'localhost' IDENTIFIED BY '$pw';
CREATE USER IF NOT EXISTS '$user'@'127.0.0.1' IDENTIFIED BY '$pw';
ALTER USER '$user'@'localhost' IDENTIFIED BY '$pw';
ALTER USER '$user'@'127.0.0.1' IDENTIFIED BY '$pw';
GRANT ALL PRIVILEGES ON ``$db``.* TO '$user'@'localhost';
GRANT ALL PRIVILEGES ON ``$db``.* TO '$user'@'127.0.0.1';
GRANT ALL PRIVILEGES ON ``$testDb``.* TO '$user'@'localhost';
GRANT ALL PRIVILEGES ON ``$testDb``.* TO '$user'@'127.0.0.1';
FLUSH PRIVILEGES;
SELECT 'OK: database and user are ready' AS status;
"@

# The SQL goes through a temp file (deleted afterwards) rather than stdin,
# so that mysql's password prompt can read from the keyboard.
$sqlFile = Join-Path $env:TEMP "ccps_setup_$([guid]::NewGuid().ToString('N')).sql"
try {
    [IO.File]::WriteAllText($sqlFile, $sql)
    Write-Host "Creating database '$db' and user '$user'. Enter the MySQL root password when asked."
    mysql -u root -p --execute="source $($sqlFile -replace '\\', '/')"
    if ($LASTEXITCODE -ne 0) { throw "mysql exited with code $LASTEXITCODE" }
}
finally {
    Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
}
