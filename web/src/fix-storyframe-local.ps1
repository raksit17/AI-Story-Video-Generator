param(
  [string]$ProjectRoot = 'D:\GitPoom\AI Story Video Generator'
)
$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appSource = Join-Path $scriptRoot 'App.vue'
$vueTarget = Join-Path $ProjectRoot 'web\src\App.vue'
$apiTarget = Join-Path $ProjectRoot 'api\src\stories\stories.service.ts'

if (!(Test-Path $appSource)) { throw "App.vue not found beside this script: $appSource" }
if (!(Test-Path $vueTarget) -or !(Test-Path $apiTarget)) {
  throw "The project path is wrong: $ProjectRoot"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $env:TEMP "Storyframe-Code-Backup-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $vueTarget -Destination (Join-Path $backup 'App.vue.before-fix') -Force
Copy-Item -LiteralPath $apiTarget -Destination (Join-Path $backup 'stories.service.ts.before-fix') -Force
Write-Host "Backups: $backup"

Push-Location $ProjectRoot
try {
  git fetch origin main
  if ($LASTEXITCODE -ne 0) { throw 'git fetch failed; original files are backed up and unchanged.' }

  # Restore the known-good API implementation from the current main branch.
  # It already contains the referenceUsed/referenceUrl variables and only one
  # uploadComfyReference method. This also resolves an unmerged API path.
  git restore --source=origin/main --staged --worktree -- api/src/stories/stories.service.ts
  if ($LASTEXITCODE -ne 0) { throw 'Cannot restore API file from origin/main.' }
  
# Check whether source and destination are the same file.
$appSourceFull = [System.IO.Path]::GetFullPath($appSource)
$vueTargetFull = [System.IO.Path]::GetFullPath($vueTarget)

if (-not [string]::Equals(
    $appSourceFull,
    $vueTargetFull,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    Copy-Item -LiteralPath $appSource -Destination $vueTarget -Force
    Write-Host "App.vue copied successfully."
} else {
    Write-Host "App.vue is already in the correct folder. Skipping copy."
}

# Do not stage a file containing unresolved Git merge conflicts.
$conflicts = Select-String -LiteralPath $vueTarget `
    -Pattern '^(<<<<<<<|=======|>>>>>>>)'

if ($conflicts) {
    throw "App.vue still contains Git merge conflicts. Fix them before building."
}

git add -- web/src/App.vue
if ($LASTEXITCODE -ne 0) {
    throw "git add App.vue failed."
}

  git add -- web/src/App.vue
  if ($LASTEXITCODE -ne 0) { throw 'git add App.vue failed.' }
  Write-Host 'Code files repaired. Validating API build...'

  Push-Location (Join-Path $ProjectRoot 'api')
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'API build failed; send the error log.' }
  } finally { Pop-Location }

  Write-Host 'Validating Web build...'
  Push-Location (Join-Path $ProjectRoot 'web')
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed; send the error log.' }
  } finally { Pop-Location }

  Write-Host 'Both builds passed. Check the Git merge state below before committing:'
  git status --short
  Write-Host "Backups remain in: $backup"
} finally {
  Pop-Location
}
