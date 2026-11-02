# Start the widget board at sign-in (HKCU Run key "WidgetBoard"), add a Start-menu shortcut with Ctrl+Alt+W, and a
# desktop shortcut with the board icon (right-click it, Pin to taskbar; Windows does not let scripts pin).
# A second launch signals the running board to toggle, so every shortcut opens/closes it. Run once per machine.
$dir = Split-Path -Parent $PSScriptRoot
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$argv = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -STA -File `"$dir\Board.ps1`""
$icon = (Join-Path $dir 'board.ico') + ',0'
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'WidgetBoard' -Value "`"$ps`" $argv"
$sh = New-Object -ComObject WScript.Shell
$lnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Widget Board.lnk'
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $ps; $s.Arguments = $argv; $s.WorkingDirectory = $dir; $s.WindowStyle = 7; $s.Hotkey = 'CTRL+ALT+W'
$s.Description = 'Open / close the widget board'; $s.IconLocation = $icon
$s.Save()
$dl = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Widget Board.lnk'
$s2 = $sh.CreateShortcut($dl)
$s2.TargetPath = $ps; $s2.Arguments = $argv; $s2.WorkingDirectory = $dir; $s2.WindowStyle = 7
$s2.Description = 'Open / close the widget board'; $s2.IconLocation = $icon
$s2.Save()
'Start at sign-in: on. Ctrl+Alt+W: ' + $lnk
'Desktop shortcut (right-click > Pin to taskbar): ' + $dl
