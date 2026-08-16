# Copy KAREN-UI-BRIEF to clipboard, then open Adam's pinned ChatGPT chat in Chrome.
# From repo root: npm run karen:ui:chrome
#
# Set chat URL once in: config/cloud/chatgpt-chrome.local.env
#   KAREN_CHATGPT_CHAT_URL=https://chatgpt.com/c/<your-greeting-exchange-id>

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$brief = Join-Path $repo "data\research\KAREN-UI-BRIEF.md"
$pasteMe = Join-Path $repo "data\research\KAREN-PASTE-INTO-CHATGPT.txt"
$envFile = Join-Path $repo "config\cloud\chatgpt-chrome.local.env"

if (-not (Test-Path $brief)) {
  Write-Error "Missing brief. Ask Cursor to refresh KAREN-UI-BRIEF.md first."
}

$url = "https://chatgpt.com/"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*#' -or $line -eq "") { return }
    if ($line -match '^KAREN_CHATGPT_CHAT_URL=(.+)$') {
      $url = $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
}
if ($env:KAREN_CHATGPT_CHAT_URL) {
  $url = $env:KAREN_CHATGPT_CHAT_URL.Trim()
}

$header = @"
KAREN UI BRIEF (from Cursor)
Reply with ONE next Cursor prompt only.
Keep unlock PARKED. No VAL/HOLDOUT. Representation before trade rules.

---

"@
$body = Get-Content -Path $brief -Raw -Encoding UTF8
$payload = $header + $body

[System.IO.File]::WriteAllText($pasteMe, $payload, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote backup: data\research\KAREN-PASTE-INTO-CHATGPT.txt"

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) {
  Start-Process -FilePath $chrome -ArgumentList @("--new-window", $url) | Out-Null
} else {
  Start-Process $url | Out-Null
}
Write-Host "Opening: $url"
Start-Sleep -Seconds 2

Set-Clipboard -Value $payload
$payload | & cmd.exe /c clip
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  [System.Windows.Forms.Clipboard]::SetText($payload)
} catch {}
Start-Sleep -Milliseconds 300

$check = ""
try { $check = Get-Clipboard -Raw } catch { $check = "" }
if ($check -and $check.StartsWith("KAREN UI BRIEF")) {
  Write-Host "Clipboard OK - in Greeting exchange chat: Ctrl+V then Enter"
} else {
  Write-Host "Clipboard may have failed. Use KAREN-PASTE-INTO-CHATGPT.txt (Select All, Copy)."
  if (Test-Path $pasteMe) { Start-Process notepad.exe $pasteMe }
}
