[CmdletBinding()]
param(
    [ValidateRange(30, 1800)]
    [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryPath = Split-Path -Parent $PSScriptRoot
$composePath = Join-Path $repositoryPath 'deploy/docker/docker-compose.local.yml'
$clientEnvironmentPath = Join-Path $repositoryPath 'app/client/.env.local'
$backendOrigin = 'http://127.0.0.1:8080'

$dockerCommand = Get-Command docker.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$dockerPath = if ($dockerCommand) { $dockerCommand.Source } else { $null }

if (-not $dockerPath) {
    $dockerCandidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin/docker.exe')
    )
    $dockerPath = $dockerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

if (-not $dockerPath) {
    throw 'Docker CLI was not found. Install Docker Desktop, start it using Linux containers, and run this script again.'
}

# Docker's credential helpers are alongside its CLI, including after a fresh install.
$dockerBinPath = Split-Path -Parent $dockerPath
$env:PATH = $dockerBinPath + [IO.Path]::PathSeparator + $env:PATH

try {
    $daemonVersion = & $dockerPath info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $daemonVersion) {
        throw 'Docker daemon is unavailable.'
    }
} catch {
    throw 'Cannot connect to Docker. Start Docker Desktop, wait until its Linux engine is running, and run this script again.'
}

try {
    $composeVersion = & $dockerPath compose version --short 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $composeVersion) {
        throw 'Docker Compose is unavailable.'
    }
} catch {
    throw 'Docker Compose is unavailable. Install or update Docker Desktop, then run this script again.'
}

Write-Host 'Starting the local Appsmith backend on http://127.0.0.1:8080. The first image download may take several minutes.'
& $dockerPath compose --project-name asmith-local --file $composePath up -d
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose could not start Appsmith. Check Docker Desktop and ensure port 8080 is free. Existing data has been retained.'
}

Write-Host "Waiting up to $TimeoutSeconds seconds for Appsmith to become ready..."
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$ready = $false
$backendVersion = $null
$userProfile = $null

while ([DateTime]::UtcNow -lt $deadline) {
    try {
        $secondsRemaining = [Math]::Max(1, [int][Math]::Ceiling(($deadline - [DateTime]::UtcNow).TotalSeconds))
        $info = Invoke-RestMethod -Uri "$backendOrigin/info" -TimeoutSec ([Math]::Min(10, $secondsRemaining))
        $candidateVersion = [string]$info.version
        if ($candidateVersion -notmatch '^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$') {
            throw 'Backend version is not ready.'
        }

        $secondsRemaining = [Math]::Max(1, [int][Math]::Ceiling(($deadline - [DateTime]::UtcNow).TotalSeconds))
        $profile = Invoke-RestMethod -Uri "$backendOrigin/api/v1/users/me" -Headers @{ 'X-Appsmith-Version' = $candidateVersion } -TimeoutSec ([Math]::Min(10, $secondsRemaining))
        if ($profile.responseMeta.status -ne 200 -or $profile.responseMeta.success -ne $true -or $null -eq $profile.data) {
            throw 'Backend API is not ready.'
        }

        $backendVersion = $candidateVersion
        $userProfile = $profile.data
        $ready = $true
        break
    } catch {
        # The container serves its startup page until all internal services are ready.
        # Do not print response bodies, headers, or cookies while waiting.
    }

    $millisecondsRemaining = [Math]::Max(0, [int]($deadline - [DateTime]::UtcNow).TotalMilliseconds)
    if ($millisecondsRemaining -gt 0) {
        Start-Sleep -Milliseconds ([Math]::Min(3000, $millisecondsRemaining))
    }
}

if (-not $ready) {
    throw "Appsmith did not become ready within $TimeoutSeconds seconds. Inspect the asmith-local project in Docker Desktop, then rerun this script. Frontend configuration has not been changed; container data has been retained."
}

$environmentText = if (Test-Path -LiteralPath $clientEnvironmentPath) {
    [IO.File]::ReadAllText($clientEnvironmentPath)
} else {
    ''
}
$newline = if ($environmentText.Contains("`r`n")) { "`r`n" } else { "`n" }
$updates = [ordered]@{
    APPSMITH_BACKEND_URL = $backendOrigin
    REACT_APP_APPSMITH_VERSION_ID = $backendVersion
}

foreach ($entry in $updates.GetEnumerator()) {
    $pattern = '(?m)^[\t ]*(?:export[\t ]+)?' + [regex]::Escape($entry.Key) + '[\t ]*=[^\r\n]*'
    $replacement = $entry.Key + '=' + $entry.Value
    if ([regex]::IsMatch($environmentText, $pattern)) {
        $environmentText = [regex]::Replace($environmentText, $pattern, $replacement)
    } else {
        if ($environmentText.Length -gt 0 -and -not $environmentText.EndsWith("`n")) {
            $environmentText += $newline
        }
        $environmentText += $replacement + $newline
    }
}

[IO.File]::WriteAllText($clientEnvironmentPath, $environmentText, [Text.UTF8Encoding]::new($false))

Write-Host "Appsmith $backendVersion is ready at $backendOrigin."
Write-Host 'Updated APPSMITH_BACKEND_URL and REACT_APP_APPSMITH_VERSION_ID in app/client/.env.local.'
Write-Host 'Restart the frontend to use the local backend. The frontend process has not been changed.'
if ($userProfile.PSObject.Properties['isEmptyInstance'] -and $userProfile.isEmptyInstance) {
    Write-Host 'This is a new instance. Open the frontend to create the initial administrator account.'
}
