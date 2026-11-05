@echo off
chcp 65001 >nul
title Croqi - serveur de l'application
cd /d "%~dp0"
echo.
echo  ===== Croqi =====
echo  Sur ton iPhone (meme Wi-Fi que ce PC), ouvre Safari a l'une de ces adresses :
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo     http://%%b:8000
)
echo.
echo  Puis : bouton Partager ^> "Sur l'ecran d'accueil".
echo  Laisse cette fenetre ouverte. Ctrl+C pour arreter.
echo.
if not exist "%TEMP%\croqi-jtmp" mkdir "%TEMP%\croqi-jtmp"
jwebserver -J-Djdk.net.unixdomain.tmpdir="%TEMP%\croqi-jtmp" -b 0.0.0.0 -p 8000 -d "%cd%"
pause
