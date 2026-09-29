# Runs every automated test suite with coverage and prints one summary.
#
#   powershell -ExecutionPolicy Bypass -File .\run_tests.ps1            # unit/integration suites
#   powershell -ExecutionPolicy Bypass -File .\run_tests.ps1 -All       # + browser (Playwright) + Postman (Newman)
#
# Browser and Postman suites start their own servers on a throwaway database,
# so ports 5173, 8000 and 8001 must be free. The real database is never touched.
param([switch]$All)

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$results = [System.Collections.Generic.List[object]]::new()

function Add-Result($suite, $tests, $failed, $coverage, $exit) {
    $results.Add([pscustomobject]@{
        Suite = $suite; Tests = $tests; Passed = $tests - $failed; Failed = $failed
        Coverage = $coverage; Status = $(if ($exit -eq 0 -and $failed -eq 0) { 'PASS' } else { 'FAIL' })
    })
}

function Count($text, $pattern) {
    $m = [regex]::Match($text, $pattern)
    if ($m.Success) { [int]$m.Groups[1].Value } else { 0 }
}

Write-Host "`n=== Django (pytest + coverage) ===" -ForegroundColor Cyan
Push-Location "$root\backend\django_backend"
$out = (& .\venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --cov --cov-report=term --cov-report=html 2>&1 | Out-String)
$code = $LASTEXITCODE; Pop-Location
$out -split "`n" | Select-String -Pattern 'TOTAL|passed|failed' | ForEach-Object { $_.Line.Trim() }
Add-Result 'Django API (pytest)' ((Count $out '(\d+) passed') + (Count $out '(\d+) failed')) (Count $out '(\d+) failed') ([regex]::Match($out, 'TOTAL.*?(\d+\.\d+%)').Groups[1].Value) $code

Write-Host "`n=== FastAPI (pytest + coverage) ===" -ForegroundColor Cyan
Push-Location "$root\backend\fastapi_backend"
$out = (& .\venv\Scripts\python.exe -m pytest -q -p no:warnings --cov=app --cov-branch --cov-report=term --cov-report=html 2>&1 | Out-String)
$code = $LASTEXITCODE; Pop-Location
$out -split "`n" | Select-String -Pattern 'TOTAL|passed|failed' | ForEach-Object { $_.Line.Trim() }
Add-Result 'FastAPI payments (pytest)' ((Count $out '(\d+) passed') + (Count $out '(\d+) failed')) (Count $out '(\d+) failed') ([regex]::Match($out, 'TOTAL.*?(\d+%)').Groups[1].Value) $code

Write-Host "`n=== Frontend unit (Vitest + coverage) ===" -ForegroundColor Cyan
Push-Location "$root\frontend"
$out = (cmd /c "npx vitest run --coverage 2>&1" | Out-String)
$code = $LASTEXITCODE; Pop-Location
$out -split "`n" | Select-String -Pattern 'Tests |Lines|Branches' | ForEach-Object { $_.Line.Trim() }
Add-Result 'Frontend logic (Vitest)' ((Count $out 'Tests\s+(?:\d+ failed \| )?(\d+) passed') + (Count $out 'Tests\s+(\d+) failed')) (Count $out 'Tests\s+(\d+) failed') ([regex]::Match($out, 'Lines\s*:\s*([\d.]+%)').Groups[1].Value) $code

if ($All) {
    Write-Host "`n=== Browser end-to-end (Playwright, Microsoft Edge) ===" -ForegroundColor Cyan
    Push-Location "$root\frontend"
    $out = (cmd /c "npx playwright test --reporter=line 2>&1" | Out-String)
    $code = $LASTEXITCODE; Pop-Location
    $out -split "`n" | Select-String -Pattern '^\s*\d+ (passed|failed|flaky)' | ForEach-Object { $_.Line.Trim() }
    Add-Result 'Browser E2E (Playwright)' ((Count $out '(\d+) passed') + (Count $out '(\d+) failed')) (Count $out '(\d+) failed') 'n/a (UI flows)' $code

    Write-Host "`n=== Postman collection (Newman) ===" -ForegroundColor Cyan
    $out = (& "$root\postman\run_newman.ps1" *>&1 | Out-String)
    $code = $LASTEXITCODE
    $out -split "`n" | Select-String -Pattern 'requests|assertions' | ForEach-Object { $_.Line.Trim() }
    $req = [regex]::Match($out, 'requests\s*\S\s*(\d+)\s*\S\s*(\d+)')
    $asr = [regex]::Match($out, 'assertions\s*\S\s*(\d+)\s*\S\s*(\d+)')
    Add-Result 'API contract (Postman/Newman)' ([int]$asr.Groups[1].Value) ([int]$asr.Groups[2].Value) "$($req.Groups[1].Value) requests" $code
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-String | Write-Host
$totalTests = ($results | Measure-Object Tests -Sum).Sum
$totalFailed = ($results | Measure-Object Failed -Sum).Sum
Write-Host "Total: $totalTests tests, $($totalTests - $totalFailed) passed, $totalFailed failed"
Write-Host "HTML coverage: backend\django_backend\htmlcov, backend\fastapi_backend\htmlcov, frontend\coverage"
exit $(if ($results.Status -contains 'FAIL') { 1 } else { 0 })
