# Generates one symbol per widget card and per category with the OpenAI Images API (build time only).
# Output: ui-icons\<slug>.png (transparent). Skips icons that already exist.
param([string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ui-icons'))
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$key = $env:OPENAI_API_KEY
if (-not $key) { $key = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User') }
if (-not $key) { throw 'OPENAI_API_KEY not set' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
# slug = card title in lower case with non-letters as dashes (the board looks icons up the same way)
$icons = [ordered]@{
    'daily-runs'          = @('a stack of three overlapping message cards with a small sparkle', 'soft purple #B07EE6')
    'quick-capture'       = @('a pencil writing on a small note with a plus sign', 'soft blue #4A9CF2')
    'suggested-work'      = @('a light bulb with a small four-point sparkle', 'soft purple #B07EE6')
    'study'               = @('an open book with a bookmark ribbon', 'soft blue #4A9CF2')
    'up-next'             = @('a clock face with an arrow pointing forward', 'soft blue #4A9CF2')
    'coursework'          = @('a checklist clipboard with two ticks', 'soft blue #4A9CF2')
    'due'                 = @('a calendar page with an exclamation dot', 'soft coral red #F26B5E')
    'focus'               = @('a timer ring around a small leaf', 'soft green #4CCF7A')
    'gym'                 = @('a dumbbell', 'soft green #4CCF7A')
    'display'             = @('a monitor with a sun and half-moon brightness symbol', 'warm amber #F2A33A')
    'exams'               = @('a graduation cap over an hourglass', 'warm amber #F2A33A')
    'weather'             = @('a sun partly behind a cloud', 'soft blue #4A9CF2')
    'news-trending'       = @('a folded newspaper with a small upward trend arrow', 'soft purple #B07EE6')
    'system'              = @('a computer chip with small circuit lines', 'soft green #4CCF7A')
    # header shortcuts (generic symbols, not brand logos)
    'sc-gmail'            = @('a closed envelope', 'soft coral red #F26B5E')
    'sc-calendar'         = @('a calendar page with a grid of days', 'soft blue #4A9CF2')
    'sc-study'            = @('a folder with a book on it', 'soft blue #4A9CF2')
    'sc-downloads'        = @('a downward arrow into a tray', 'soft green #4CCF7A')
    'sc-claude'           = @('a simple eight-pointed starburst', 'warm terracotta orange #D97757')
    # display presets
    'dp-reset'            = @('a circular counter-clockwise arrow', 'light grey #E5E5EA')
    'dp-day'              = @('a bright sun with rays', 'warm amber #F2A33A')
    'dp-evening'          = @('a sun setting behind a horizon line', 'warm orange #F2A33A')
    'dp-night'            = @('a crescent moon with two small stars', 'soft purple #B07EE6')
    'dp-nightlight'       = @('a lamp glowing with warm light', 'warm amber #F2A33A')
    # focus modes
    'fm-pomodoro'         = @('a tomato-shaped timer', 'soft coral red #F26B5E')
    'fm-timer'            = @('an hourglass', 'soft green #4CCF7A')
    'fm-stopwatch'        = @('a stopwatch', 'soft blue #4A9CF2')
    # news tabs
    'nw-x'                = @('a bold hashtag sign with a small upward spark', 'light grey #E5E5EA')
    'nw-trending'         = @('an upward zig-zag trend arrow with a flame', 'soft purple #B07EE6')
    'nw-world'            = @('a globe with meridian lines', 'soft blue #4A9CF2')
    'nw-tech'             = @('a laptop with a code symbol', 'soft green #4CCF7A')
    'nw-ai'               = @('a brain made of connected circuit nodes', 'soft purple #B07EE6')
    'nw-business'         = @('a rising bar chart with a coin', 'soft green #4CCF7A')
    # categories (quick capture lists and suggestion areas)
    'cat-study'           = @('a graduation cap', 'soft blue #4A9CF2')
    'cat-work'            = @('a briefcase', 'warm amber #F2A33A')
    'cat-career'          = @('a briefcase', 'warm amber #F2A33A')
    'cat-health'          = @('a heart with a pulse line', 'soft coral red #F26B5E')
    'cat-gym'             = @('a dumbbell', 'soft green #4CCF7A')
    'cat-admin'           = @('a stamped form with a pen', 'light grey #E5E5EA')
    'cat-errands'         = @('a shopping bag', 'warm amber #F2A33A')
    'cat-personal'        = @('a simple person silhouette with a small heart', 'soft blue #4A9CF2')
    # gym actions
    'act-done'            = @('a bold checkmark inside a circle', 'soft green #4CCF7A')
    'act-skip'            = @('a forward skip arrow', 'light grey #E5E5EA')
}
foreach ($k in $icons.Keys) {
    $file = Join-Path $OutDir ($k + '.png')
    if (Test-Path $file) { "skip  $k"; continue }
    $what = $icons[$k][0]; $col = $icons[$k][1]
    $prompt = "A single minimal symbol: $what. Style: simple flat symbol, filled glyph with rounded corners, one colour $col with a slightly lighter highlight, " +
              "centered with generous padding, transparent background, no text, no letters, no frame, no shadow, crisp at small sizes."
    $body = @{ model = 'gpt-image-1'; prompt = $prompt; size = '1024x1024'; quality = 'low'; background = 'transparent'; n = 1 } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri 'https://api.openai.com/v1/images/generations' -Method Post -Headers @{ Authorization = "Bearer $key" } -ContentType 'application/json' -Body $body -TimeoutSec 180
        [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($r.data[0].b64_json))
        "done  $k"
    } catch { "FAIL  $k : $($_.Exception.Message)" }
}
'finished'
