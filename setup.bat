@echo off
setlocal EnableExtensions
title TalentIQ Installer

REM Run the PowerShell installer that lives next to this file.
REM -ExecutionPolicy Bypass lets it run even on locked-down machines
REM without changing any system-wide settings.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
    echo Setup did not finish successfully ^(exit code %RC%^).
    echo Read the messages above, fix the issue, and run setup.bat again.
)
if defined TALENTIQ_SETUP_CALLED_FROM_START exit /b %RC%
echo Press any key to close this window.
pause >nul
exit /b %RC%
