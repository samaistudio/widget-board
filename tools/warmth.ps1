# Software night light for every monitor (like f.lux): sets each display's gamma ramp to a warmer colour.
# Dot-source, then: Set-Warmth 0..100   (0 = normal colours)
if (-not ('DeskGamma' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DeskGamma {
    [DllImport("gdi32.dll")] static extern IntPtr CreateDC(string driver, string device, string output, IntPtr init);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool SetDeviceGammaRamp(IntPtr hdc, ushort[] ramp);
    public static bool Apply(string device, double r, double g, double b) {
        ushort[] ramp = new ushort[768];
        for (int i = 0; i < 256; i++) {
            ramp[i]       = (ushort)Math.Min(65535, i * 256 * r);
            ramp[i + 256] = (ushort)Math.Min(65535, i * 256 * g);
            ramp[i + 512] = (ushort)Math.Min(65535, i * 256 * b);
        }
        IntPtr hdc = CreateDC(null, device, null, IntPtr.Zero);
        if (hdc == IntPtr.Zero) return false;
        bool ok = SetDeviceGammaRamp(hdc, ramp);
        DeleteDC(hdc);
        return ok;
    }
}
'@
}
Add-Type -AssemblyName System.Windows.Forms
# 0 = 6500 K (normal), 100 = very warm (~2700 K). Channel multipliers approximate a blackbody white point.
function Set-Warmth([int]$pct) {
    $pct = [math]::Max(0, [math]::Min(100, $pct))
    $f = $pct / 100.0
    $r = 1.0; $g = 1.0 - 0.30 * $f; $b = 1.0 - 0.62 * $f
    $res = @()
    foreach ($s in [System.Windows.Forms.Screen]::AllScreens) { $res += '{0}={1}' -f $s.DeviceName, [DeskGamma]::Apply($s.DeviceName, $r, $g, $b) }
    return ($res -join ' ')
}
