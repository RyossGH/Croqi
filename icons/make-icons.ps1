# Génère les icônes PNG de Croqi (gamelle + croquettes sur fond marine)
Add-Type -AssemblyName System.Drawing
function Make($size, $path) {
  $b = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#14202B'))
  $s = $size / 512.0
  $orange = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#D9621E'))
  $cream  = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#F2A774'))
  $white  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  # croquettes
  foreach ($c in @(@(196,196,58),@(268,170,52),@(322,222,50),@(232,250,46),@(150,250,40),@(300,276,40))) {
    $g.FillEllipse($cream, [float](($c[0]-$c[2]/2)*$s), [float](($c[1]-$c[2]/2)*$s), [float]($c[2]*$s), [float]($c[2]*$s))
  }
  # gamelle (demi-disque + rebord)
  $g.FillPie($orange, [float](96*$s), [float](140*$s), [float](320*$s), [float](260*$s), 0, 180)
  $g.FillRectangle($white, [float](84*$s), [float](262*$s), [float](344*$s), [float](24*$s))
  $g.Dispose(); $b.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
}
$d = Split-Path -Parent $MyInvocation.MyCommand.Path
Make 180 "$d\apple-touch-icon.png"
Make 192 "$d\icon-192.png"
Make 512 "$d\icon-512.png"
