@echo off
REM Kip Language Installation Script for Windows
REM This script installs dependencies and builds kip-lang

echo.
echo ========================================
echo Kip Language Installation for Windows
echo ========================================
echo.

REM Check if Chocolatey is installed
where choco >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Chocolatey not found. Please install it from https://chocolatey.org/
    echo.
    echo Manual installation steps:
    echo 1. Install Haskell Stack from https://www.haskell.org/stack/
    echo 2. Install Foma manually (may require building from source)
    echo 3. Clone kip-lang repository: git clone https://github.com/kip-dili/kip.git
    echo 4. Build: cd kip ^&^& stack build
    echo 5. Install: stack install
    echo.
    pause
    exit /b 1
)

echo [INFO] Installing dependencies with Chocolatey...
echo.

REM Install Stack
echo [1/3] Installing Haskell Stack...
choco install haskell-stack -y
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install Stack
    pause
    exit /b 1
)

REM Note: Foma is not available in Chocolatey
echo [WARNING] Foma is not available in Chocolatey.
echo [INFO] You may need to install Foma manually or build from source.
echo.

REM Clone and build
echo [2/3] Cloning kip-lang repository...
set TEMP_DIR=%TEMP%\kip-install
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"
cd /d "%TEMP_DIR%"

git clone --depth 1 https://github.com/kip-dili/kip.git kip-lang
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to clone repository
    pause
    exit /b 1
)

cd kip-lang

echo [3/3] Building kip-lang...
stack build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo [INFO] Installing kip binary...
stack install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Installation failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Installation completed successfully!
echo ========================================
echo.
echo Binary installed to: %USERPROFILE%\.local\bin\kip.exe
echo Make sure this directory is in your PATH.
echo.
pause
