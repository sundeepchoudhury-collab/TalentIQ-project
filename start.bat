@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TalentIQ Launcher

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%talentiq-backend"
set "FRONTEND_DIR=%ROOT%talentiq-Frontend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"
set "LOG_DIR=%ROOT%.runlogs"
set "LAUNCHER_DIR=%ROOT%.launcher"
set "SETUP_BAT=%ROOT%setup.bat"
set "BACKEND_URL=http://127.0.0.1:8000"
set "FRONTEND_URL=http://127.0.0.1:5173"

if not exist "%BACKEND_DIR%\app\main.py" goto missing_project
if not exist "%FRONTEND_DIR%\package.json" goto missing_project
call :ensure_runtime_files
if errorlevel 1 goto launcher_error

echo.
echo ========================================
echo          Starting TalentIQ
echo ========================================
echo.

echo [1/6] Checking Python environment...
if exist "!PYTHON_EXE!" (
    "!PYTHON_EXE!" --version >nul 2>nul
    if errorlevel 1 (
        echo The existing virtual environment belongs to another PC.
        echo Rebuilding it with this PC's Python installation...
        rmdir /S /Q "!VENV_DIR!"
        if exist "!VENV_DIR!" goto backend_error
    )
)

if not exist "!PYTHON_EXE!" call :create_venv
if errorlevel 1 goto backend_error

call :check_python_version
if errorlevel 1 goto backend_error

"!PYTHON_EXE!" -c "import fastapi, uvicorn, sqlalchemy, pandas, openpyxl" >nul 2>nul
if errorlevel 1 (
    echo Installing backend dependencies. This is only needed once...
    "!PYTHON_EXE!" -m pip install --upgrade pip setuptools wheel
    if errorlevel 1 goto backend_error
    "!PYTHON_EXE!" -m pip install --prefer-binary -r "%BACKEND_DIR%\requirements.txt"
    if errorlevel 1 goto backend_error
) else (
    echo Backend dependencies are ready.
)

echo [2/6] Checking frontend environment...
where npm >nul 2>nul
if errorlevel 1 goto node_missing
if not exist "%FRONTEND_DIR%\node_modules\.bin\vite.cmd" (
    echo Installing frontend dependencies. This is only needed once...
    pushd "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        popd
        goto frontend_error
    )
    popd
) else (
    echo Frontend dependencies are ready.
)

echo [3/6] Checking PostgreSQL setup and database tables...
call :ensure_setup
if errorlevel 1 goto setup_error

echo [4/6] Stopping previous TalentIQ services...
call :stop_port 8000
call :stop_port 5173

echo [5/6] Starting backend and frontend...
break > "%LOG_DIR%\backend.out.log"
break > "%LOG_DIR%\backend.err.log"
break > "%LOG_DIR%\frontend.out.log"
break > "%LOG_DIR%\frontend.err.log"

start "TalentIQ Backend" /min "%LAUNCHER_DIR%\backend.bat"
start "TalentIQ Frontend" /min "%LAUNCHER_DIR%\frontend.bat"

echo [6/6] Waiting for TalentIQ to become ready...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=(Get-Date).AddSeconds(45); do { $back=$false; $front=$false; try { $back=(Invoke-WebRequest -UseBasicParsing -Uri '%BACKEND_URL%' -TimeoutSec 2).StatusCode -eq 200 } catch {}; try { $front=(Invoke-WebRequest -UseBasicParsing -Uri '%FRONTEND_URL%' -TimeoutSec 2).StatusCode -eq 200 } catch {}; if ($back -and $front) { exit 0 }; Start-Sleep -Milliseconds 750 } while ((Get-Date) -lt $deadline); exit 1"

if errorlevel 1 goto startup_error

echo.
echo TalentIQ is ready: %FRONTEND_URL%
echo Logs are stored in: %LOG_DIR%
echo.
if not defined TALENTIQ_NO_BROWSER start "" "%FRONTEND_URL%"
timeout /t 3 /nobreak >nul
exit /b 0

:ensure_setup
echo.
echo ========================================
echo          TalentIQ Connection Setup
echo ========================================
echo.
echo Confirm the detected PostgreSQL settings before startup.
echo Press Enter at a prompt to keep the value shown in brackets.
echo.
if not exist "%SETUP_BAT%" (
    echo ERROR: setup.bat was not found beside start.bat.
    echo Expected: %SETUP_BAT%
    exit /b 1
)

echo Starting TalentIQ setup...
set "TALENTIQ_SETUP_CALLED_FROM_START=1"
call "%SETUP_BAT%"
set "TALENTIQ_SETUP_CALLED_FROM_START="
if errorlevel 1 exit /b 1

if not exist "%BACKEND_DIR%\.env" exit /b 1
findstr /B /C:"DATABASE_URL=" "%BACKEND_DIR%\.env" >nul 2>nul
if errorlevel 1 exit /b 1

echo.
echo Setup check complete.
exit /b 0

:ensure_runtime_files
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if errorlevel 1 exit /b 1
if not exist "%LAUNCHER_DIR%" mkdir "%LAUNCHER_DIR%"
if errorlevel 1 exit /b 1

> "%LAUNCHER_DIR%\backend.bat" echo @echo off
>> "%LAUNCHER_DIR%\backend.bat" echo set "ROOT=%%~dp0.."
>> "%LAUNCHER_DIR%\backend.bat" echo cd /d "%%ROOT%%\talentiq-backend"
>> "%LAUNCHER_DIR%\backend.bat" echo "%%ROOT%%\talentiq-backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 1^>^>"%%ROOT%%\.runlogs\backend.out.log" 2^>^>"%%ROOT%%\.runlogs\backend.err.log"

> "%LAUNCHER_DIR%\frontend.bat" echo @echo off
>> "%LAUNCHER_DIR%\frontend.bat" echo set "ROOT=%%~dp0.."
>> "%LAUNCHER_DIR%\frontend.bat" echo cd /d "%%ROOT%%\talentiq-Frontend"
>> "%LAUNCHER_DIR%\frontend.bat" echo call npm run dev -- --host 127.0.0.1 --port 5173 1^>^>"%%ROOT%%\.runlogs\frontend.out.log" 2^>^>"%%ROOT%%\.runlogs\frontend.err.log"
exit /b 0

:create_venv
echo Creating backend virtual environment...
where py >nul 2>nul
if not errorlevel 1 (
    py -3.12 -m venv "%VENV_DIR%" 2>nul && exit /b 0
    py -3.11 -m venv "%VENV_DIR%" 2>nul && exit /b 0
    py -3 -m venv "%VENV_DIR%"
    exit /b %errorlevel%
)

where python >nul 2>nul
if errorlevel 1 goto python_missing
python -m venv "%VENV_DIR%"
exit /b %errorlevel%

:stop_port
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%~1 " ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%P >nul 2>nul
)
exit /b 0

:missing_project
echo ERROR: TalentIQ project folders were not found beside start.bat.
goto fail

:python_missing
echo ERROR: Python was not found. Install Python 3.11 or newer and try again.
goto fail

:check_python_version
set "PYVER_MAJOR="
set "PYVER_MINOR="
"!PYTHON_EXE!" -c "import sys; print(sys.version_info[0], sys.version_info[1])" > "%TEMP%\talentiq_pyver.txt" 2> "%TEMP%\talentiq_pyver.err"
if errorlevel 1 (
    echo ERROR: Unable to run Python at !PYTHON_EXE!.
    if exist "%TEMP%\talentiq_pyver.err" type "%TEMP%\talentiq_pyver.err"
    del "%TEMP%\talentiq_pyver.txt" 2>nul
    del "%TEMP%\talentiq_pyver.err" 2>nul
    exit /b 1
)
for /f "usebackq tokens=1,2" %%A in ("%TEMP%\talentiq_pyver.txt") do (
    set "PYVER_MAJOR=%%A"
    set "PYVER_MINOR=%%B"
)
del "%TEMP%\talentiq_pyver.txt" 2>nul
del "%TEMP%\talentiq_pyver.err" 2>nul

if not defined PYVER_MAJOR (
    echo ERROR: Unable to run Python at !PYTHON_EXE!.
    exit /b 1
)
if not "%PYVER_MAJOR%"=="3" (
    echo ERROR: Unsupported Python major version. Install Python 3.11 or newer and rerun.
    exit /b 1
)
if %PYVER_MINOR% LSS 11 (
    echo ERROR: Python %PYVER_MAJOR%.%PYVER_MINOR% is not supported. Install Python 3.11 or newer.
    exit /b 1
)
if %PYVER_MINOR% GTR 12 (
    echo WARNING: Python %PYVER_MAJOR%.%PYVER_MINOR% is newer than tested versions ^(3.11/3.12^).
    echo The launcher will continue, but some dependencies may not have prebuilt wheels and may fail to build from source.
)
exit /b 0

:node_missing
echo ERROR: Node.js/npm was not found. Install Node.js LTS and try again.
goto fail

:setup_error
echo ERROR: TalentIQ setup did not complete.
goto fail

:launcher_error
echo ERROR: TalentIQ launcher files could not be created.
goto fail

:backend_error
echo ERROR: Backend setup failed.
goto fail

:frontend_error
echo ERROR: Frontend setup failed.
goto fail

:startup_error
echo.
echo ERROR: TalentIQ did not start within 45 seconds.
echo Backend log: %LOG_DIR%\backend.err.log
echo Frontend log: %LOG_DIR%\frontend.err.log
goto fail

:fail
echo.
echo Press any key to close this window.
pause >nul
exit /b 1
