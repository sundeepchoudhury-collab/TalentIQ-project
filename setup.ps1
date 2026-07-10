<#
  TalentIQ Installer
  -------------------------------------------------------------
  Configures TalentIQ for THIS computer:

    1. Asks for your local PostgreSQL connection details
       (username + password, with sensible defaults for the rest).
    2. Tests that it can actually connect.
    3. Creates the "talentiq" database if it does not exist yet.
    4. Writes a working DATABASE_URL into talentiq-backend\.env.
    5. Optionally stores your API keys:
         - OPENAI_API_KEY    -> talentiq-backend\.env   (AI matching)
         - ANTHROPIC_API_KEY -> talentiq-Frontend\.env    (frontend proxy)
       Every other line in those files is left untouched.

  You normally just double-click setup.bat, which calls this script.

  Power users / automation can also call it directly, e.g.:
      powershell -ExecutionPolicy Bypass -File setup.ps1 `
          -Username postgres -Password "secret" `
          -OpenAiKey "sk-..." -AnthropicKey "sk-ant-..." -NonInteractive

  Switches:
      -EnvOnly        Skip the connect/create-database steps; only
                      rewrite the .env files. Use when the database
                      already exists or psql is not installed.
      -NonInteractive Never prompt; fail if a required value is missing.
                      Keys are only written if passed as parameters.
#>

[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPlainTextForPassword', 'Password',
    Justification = 'Optional plaintext param for non-interactive automation only; the interactive path reads it masked, and psql/PGPASSWORD requires plaintext regardless.')]
param(
    [string]$Username,
    [string]$Password,
    [string]$DbName = "talentiq",
    [string]$DbHost = "localhost",
    [int]$DbPort = 5432,
    [string]$OpenAiKey,
    [string]$AnthropicKey,
    [string]$BackendDir,
    [string]$FrontendDir,
    [switch]$EnvOnly,
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

# -- Small helpers for coloured, consistent output ---------------
function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   [!]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "   [X]  $msg" -ForegroundColor Red }

function Read-Default([string]$label, [string]$default) {
    if ($NonInteractive) { return $default }
    $answer = Read-Host "   $label [$default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
    return $answer.Trim()
}

function Read-Secret([string]$label) {
    if ($NonInteractive) { return "" }
    $secure = Read-Host "   $label" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Read-SecretDefault([string]$label, [string]$default) {
    if ($NonInteractive) { return $default }
    if ([string]::IsNullOrWhiteSpace($default)) {
        return Read-Secret $label
    }
    $secure = Read-Host "   $label [press Enter to keep current password]" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $answer = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
        return $answer
    }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Prompt for an optional value. Blank answer => $null => "keep what's there".
function Read-OptionalKey([string]$label) {
    if ($NonInteractive) { return $null }
    Write-Host "   $label" -ForegroundColor Gray
    $answer = Read-Host "   paste the key, or press Enter to keep the current value"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $null }
    return $answer.Trim()
}

# Read/replace/append KEY=value lines in a .env file, preserving everything
# else. Reads & writes UTF-8 without a BOM so non-ASCII comments survive
# (Windows PowerShell's Get-Content/Set-Content would corrupt them).
function Set-EnvValues {
    param(
        [string]$Path,
        [string]$ExamplePath,
        $Values   # [ordered] hashtable: KEY -> value
    )

    $leaf = Split-Path $Path -Leaf
    if (-not (Test-Path -LiteralPath $Path)) {
        if ($ExamplePath -and (Test-Path -LiteralPath $ExamplePath)) {
            Copy-Item -LiteralPath $ExamplePath -Destination $Path
            Write-Ok "Created $leaf from $(Split-Path $ExamplePath -Leaf)"
        } else {
            [System.IO.File]::WriteAllText($Path, "", (New-Object System.Text.UTF8Encoding($false)))
            Write-Ok "Created a new $leaf"
        }
    }

    # One-time backup of the original file.
    $backup = "$Path.bak"
    if (-not (Test-Path -LiteralPath $backup)) {
        Copy-Item -LiteralPath $Path -Destination $backup
        Write-Ok "Backed up the original to $leaf.bak"
    }

    $raw   = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    $lines = @($raw -split "`r`n|`n|`r")
    # A trailing newline leaves one empty element; drop it so we re-add exactly one.
    if ($lines.Count -gt 0 -and $lines[-1] -eq "") {
        $lines = $lines[0..($lines.Count - 2)]
    }

    foreach ($key in $Values.Keys) {
        $newLine = "$key=$($Values[$key])"
        $pattern = "^\s*$([regex]::Escape($key))\s*="
        $found   = $false
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match $pattern) { $lines[$i] = $newLine; $found = $true; break }
        }
        if (-not $found) { $lines += $newLine }
    }

    $content = ($lines -join "`r`n") + "`r`n"
    [System.IO.File]::WriteAllText($Path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-ExistingDatabaseConfig([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $line = [System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8) |
            Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
            Select-Object -First 1
    if (-not $line) { return $null }

    $rawUrl = ($line -split '=', 2)[1].Trim()
    try {
        $uri = New-Object System.Uri($rawUrl)
        $userInfo = $uri.UserInfo -split ':', 2
        return @{
            Username = [uri]::UnescapeDataString($userInfo[0])
            Password = if ($userInfo.Count -gt 1) { [uri]::UnescapeDataString($userInfo[1]) } else { "" }
            Host = $uri.Host
            Port = $uri.Port
            Database = $uri.AbsolutePath.TrimStart('/')
        }
    }
    catch {
        Write-Warn "The existing DATABASE_URL could not be read; using detected defaults."
        return $null
    }
}

function Find-ListeningPostgresPort([int]$preferredPort) {
    $ports = @()
    try {
        $netstat = & netstat -ano -p tcp 2>$null
        foreach ($line in $netstat) {
            if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+\d+\s*$') {
                $port = [int]$Matches[1]
                if ($port -ge 5432 -and $port -le 5499) { $ports += $port }
            }
        }
    }
    catch {}

    $ports = @($ports | Sort-Object -Unique)
    if ($ports -contains $preferredPort) { return $preferredPort }
    if ($ports -contains 5432) { return 5432 }
    if ($ports.Count -gt 0) { return $ports[0] }
    return $preferredPort
}

# -- Locate the project folders ----------------------------------
if ([string]::IsNullOrWhiteSpace($BackendDir))  { $BackendDir  = Join-Path $PSScriptRoot "talentiq-backend" }
if ([string]::IsNullOrWhiteSpace($FrontendDir)) { $FrontendDir = Join-Path $PSScriptRoot "talentiq-Frontend" }

$envPath              = Join-Path $BackendDir  ".env"
$examplePath          = Join-Path $BackendDir  ".env.example"
$frontendEnvPath      = Join-Path $FrontendDir ".env"
$frontendExamplePath  = Join-Path $FrontendDir ".env.example"

$existingDb = Get-ExistingDatabaseConfig $envPath
if ($existingDb) {
    if (-not $PSBoundParameters.ContainsKey("Username")) { $Username = $existingDb.Username }
    if (-not $PSBoundParameters.ContainsKey("Password")) { $Password = $existingDb.Password }
    if (-not $PSBoundParameters.ContainsKey("DbHost"))   { $DbHost = $existingDb.Host }
    if (-not $PSBoundParameters.ContainsKey("DbPort"))   { $DbPort = $existingDb.Port }
    if (-not $PSBoundParameters.ContainsKey("DbName"))   { $DbName = $existingDb.Database }
}

if (-not $PSBoundParameters.ContainsKey("DbPort")) {
    $DbPort = Find-ListeningPostgresPort $DbPort
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor White
Write-Host "          TalentIQ Installer"               -ForegroundColor White
Write-Host "===========================================" -ForegroundColor White

if (-not (Test-Path -LiteralPath $BackendDir)) {
    Write-Err "Could not find the 'talentiq-backend' folder next to this installer."
    Write-Err "Expected at: $BackendDir"
    exit 1
}

# -- Collect connection details ----------------------------------
Write-Step "Confirm your PostgreSQL connection (press Enter to accept the detected value)"

if ([string]::IsNullOrWhiteSpace($Username)) { $Username = Read-Default "PostgreSQL username" "postgres" }
$DbHost = Read-Default "Host (detected)" $DbHost
$DbPort = [int](Read-Default "Port (auto-detected)" $DbPort)
$DbName = Read-Default "PostgreSQL database to connect to" $DbName

$Password = Read-SecretDefault "PostgreSQL password" $Password

if ([string]::IsNullOrWhiteSpace($Username)) { Write-Err "Username is required."; exit 1 }
if ([string]::IsNullOrWhiteSpace($Password)) { Write-Err "Password is required."; exit 1 }

# Guard the database name so it is a safe SQL identifier.
if ($DbName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
    Write-Err "Database name '$DbName' is invalid. Use letters, numbers and underscores only."
    exit 1
}

# -- Find psql (needed for connect + create-database) ------------
function Find-Psql {
    $cmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    # Common Windows install location: C:\Program Files\PostgreSQL\<ver>\bin\psql.exe
    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
                  Sort-Object FullName -Descending
    if ($candidates) { return $candidates[0].FullName }
    return $null
}

function Initialize-DatabaseTables([string]$BackendDir, [string]$DatabaseUrl) {
    $python = Join-Path $BackendDir ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $python)) {
        Write-Warn "Backend virtual environment was not found, so table creation was skipped."
        Write-Warn "Run start.bat to install dependencies and initialize the database tables."
        return
    }

    Write-Step "Creating/updating PostgreSQL tables..."
    Push-Location $BackendDir
    $oldDatabaseUrl = $env:DATABASE_URL
    $env:DATABASE_URL = $DatabaseUrl
    try {
        $result = & $python -c "from app.db_init import initialize_database; initialize_database(); print('Database tables are ready.')" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to create/update database tables."
            Write-Err ($result | Out-String).Trim()
            exit 1
        }
        Write-Ok (($result | Out-String).Trim())
    }
    finally {
        if ($null -eq $oldDatabaseUrl) {
            Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
        } else {
            $env:DATABASE_URL = $oldDatabaseUrl
        }
        Pop-Location
    }
}

if (-not $EnvOnly) {
    $psql = Find-Psql
    if (-not $psql) {
        Write-Warn "Could not find 'psql' (PostgreSQL command-line tools)."
        Write-Warn "Skipping the connection test and database creation."
        Write-Warn "The .env will still be written. Create the '$DbName' database yourself,"
        Write-Warn "or install PostgreSQL CLI tools and re-run this installer."
        $EnvOnly = $true
    }
}

# -- Test connection + create database ---------------------------
if (-not $EnvOnly) {
    $env:PGPASSWORD = $Password

    Write-Step "Testing connection to PostgreSQL at ${DbHost}:${DbPort} as '$Username'..."
    $probe = & $psql -U $Username -h $DbHost -p $DbPort -d postgres -tAc "SELECT 1" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Could not connect to PostgreSQL."
        Write-Err ($probe | Out-String).Trim()
        Write-Err "Check that PostgreSQL is running and the username/password are correct."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Ok "Connected to PostgreSQL."

    Write-Step "Checking for database '$DbName'..."
    $exists = (& $psql -U $Username -h $DbHost -p $DbPort -d postgres -tAc `
                "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>&1 | Out-String).Trim()
    if ($exists -eq "1") {
        Write-Ok "Database '$DbName' already exists."
    } else {
        $create = & $psql -U $Username -h $DbHost -p $DbPort -d postgres -c "CREATE DATABASE `"$DbName`"" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to create database '$DbName'."
            Write-Err ($create | Out-String).Trim()
            Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
            exit 1
        }
        Write-Ok "Database '$DbName' created."
    }

    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# -- Build the DATABASE_URL (URL-encode user + password) ---------
$encUser = [uri]::EscapeDataString($Username)
$encPass = [uri]::EscapeDataString($Password)
$dbUrl   = "postgresql+psycopg://${encUser}:${encPass}@${DbHost}:${DbPort}/${DbName}"

# -- Collect optional API keys -----------------------------------
Write-Step "API keys (optional - leave blank to keep whatever is already there)"

$openAiToSet = $null
if (-not [string]::IsNullOrWhiteSpace($OpenAiKey)) { $openAiToSet = $OpenAiKey.Trim() }
elseif (-not $NonInteractive) {
    $openAiToSet = Read-OptionalKey "OpenAI API key  -> used by the backend for AI resource matching (starts with sk-...)"
}

$anthropicToSet = $null
if (-not [string]::IsNullOrWhiteSpace($AnthropicKey)) { $anthropicToSet = $AnthropicKey.Trim() }
elseif (-not $NonInteractive) {
    $anthropicToSet = Read-OptionalKey "Anthropic API key -> used by the frontend proxy (starts with sk-ant-...)"
}

# -- Write the backend .env (DATABASE_URL always, OpenAI key if given) --
Write-Step "Updating $envPath ..."
$backendValues = [ordered]@{ "DATABASE_URL" = $dbUrl }
if ($openAiToSet) { $backendValues["OPENAI_API_KEY"] = $openAiToSet }
Set-EnvValues -Path $envPath -ExamplePath $examplePath -Values $backendValues

$shownUrl = "postgresql+psycopg://${encUser}:********@${DbHost}:${DbPort}/${DbName}"
Write-Ok "DATABASE_URL set to:"
Write-Host "        $shownUrl" -ForegroundColor Gray
if ($openAiToSet) { Write-Ok "OPENAI_API_KEY updated." }

# -- Write the frontend .env (Anthropic key) if one was provided -
if ($anthropicToSet) {
    if (Test-Path -LiteralPath $FrontendDir) {
        Write-Step "Updating $frontendEnvPath ..."
        Set-EnvValues -Path $frontendEnvPath -ExamplePath $frontendExamplePath `
                      -Values ([ordered]@{ "ANTHROPIC_API_KEY" = $anthropicToSet })
        Write-Ok "ANTHROPIC_API_KEY updated."
    } else {
        Write-Warn "Frontend folder not found at $FrontendDir - skipped the Anthropic key."
    }
}

Initialize-DatabaseTables -BackendDir $BackendDir -DatabaseUrl $dbUrl

Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
if ($EnvOnly) {
    Write-Host "  (.env updated. Make sure the '$DbName' database exists.)" -ForegroundColor Yellow
}
Write-Host "  Next: run start.bat to launch TalentIQ." -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""
exit 0
