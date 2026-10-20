# Generates one small icon per gym exercise with the OpenAI Images API (build time only, key from OPENAI_API_KEY).
# Output: gym-icons\<slug>.png (transparent). Skips icons that already exist.
param([string]$Plan = (Join-Path (Split-Path -Parent $PSScriptRoot) 'gym-plan.json'), [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'gym-icons'))
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$key = $env:OPENAI_API_KEY
if (-not $key) { $key = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User') }
if (-not $key) { throw 'OPENAI_API_KEY not set' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$planObj = Get-Content $Plan -Raw -Encoding UTF8 | ConvertFrom-Json   # not $plan: names are case-insensitive and $Plan is a [string] param
$names = @($planObj.days | ForEach-Object { $_.exercises } | ForEach-Object { [string]$_.name } | Select-Object -Unique)
function Slug([string]$s) { ($s.ToLower() -replace '[^a-z0-9]+', '-').Trim('-') }
foreach ($n in $names) {
    $file = Join-Path $OutDir ((Slug $n) + '.png')
    if (Test-Path $file) { "skip  $n"; continue }
    $prompt = "A single minimal app icon for the gym exercise '$n'. A simple stylised figure performing the movement (with the machine or weight if it uses one), " +
              "drawn as clean rounded white line art with one soft green accent, simple flat icon style, centered, generous padding, " +
              "transparent background, no text, no letters, no frame, no shadow."
    $body = @{ model = 'gpt-image-1'; prompt = $prompt; size = '1024x1024'; quality = 'low'; background = 'transparent'; n = 1 } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri 'https://api.openai.com/v1/images/generations' -Method Post -Headers @{ Authorization = "Bearer $key" } -ContentType 'application/json' -Body $body -TimeoutSec 180
        [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($r.data[0].b64_json))
        "done  $n"
    } catch { "FAIL  $n : $($_.Exception.Message)" }
}
'finished'
