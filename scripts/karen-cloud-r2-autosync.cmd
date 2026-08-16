@echo off
setlocal
cd /d "%~dp0.."
set "KAREN_ENV_FILE=%USERPROFILE%\.config\karen\env"
set "PATH=C:\Program Files\Amazon\AWSCLIV2;C:\Program Files\nodejs;%PATH%"
set "ROLE=%~1"
if "%ROLE%"=="" set "ROLE=laptop"
"C:\Program Files\nodejs\npx.cmd" tsx scripts/karen-cloud-r2-autosync.ts --role %ROLE% %2 %3
exit /b %ERRORLEVEL%
