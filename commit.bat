@echo off
setlocal enabledelayedexpansion

:: Demande le message du commit
set /p msg="Message du commit : "

:: Récupérer la dernière version (tag)
for /f "tokens=*" %%i in ('git describe --tags --abbrev=0 2^>nul') do set last=%%i

:: Si aucun tag encore
if "%last%"=="" (
    set last=v1.0.0
)

echo Dernier tag trouvé : %last%

:: Extraire les parties de version
for /f "tokens=1,2,3 delims=." %%a in ("%last:~1%") do (
    set major=%%a
    set minor=%%b
    set patch=%%c
)

:: Incrémentation du patch
set /a patch+=1
set new=v%major%.%minor%.%patch%

echo Nouveau tag : %new%

:: Git add / commit / tag / push
git add .
git commit -m "%msg%"
git tag %new%
git push origin main
git push origin %new%

pause