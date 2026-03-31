@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================================================
:: LinkKVM Windows Build Script
:: ============================================================================
:: Usage:
::   scripts\build.bat                 Build release
::   scripts\build.bat --debug         Build debug
::   scripts\build.bat --help          Show help
:: ============================================================================

set "BUILD_MODE=release"
set "PROJECT_DIR=%~dp0.."

:: ---------- Parse arguments ----------
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="--debug" (
    set "BUILD_MODE=debug"
    shift
    goto :parse_args
)
if /i "%~1"=="-h" goto :show_help
if /i "%~1"=="--help" goto :show_help
echo [ERROR] Unknown argument: %~1
exit /b 1

:show_help
echo Usage: %~nx0 [options]
echo.
echo Options:
echo   --debug     Build in debug mode
echo   -h, --help  Show help
echo.
echo Prerequisites:
echo   1. Microsoft Visual C++ Build Tools (select "Desktop development with C++")
echo   2. WebView2 Runtime (usually built-in on Win10/11)
echo   3. Rust (https://rustup.rs)
echo   4. Node.js LTS (https://nodejs.org)
exit /b 0

:args_done

:: ---------- Navigate to project directory ----------
pushd "%PROJECT_DIR%"

echo ========================================
echo  LinkKVM Windows Build
echo  Build mode: %BUILD_MODE%
echo ========================================
echo.

:: ---------- Environment check ----------
call :check_prerequisites
if errorlevel 1 goto :fail

:: ---------- Install frontend dependencies ----------
call :install_deps
if errorlevel 1 goto :fail

:: ---------- Build ----------
call :build_tauri
if errorlevel 1 goto :fail

:: ---------- Collect artifacts ----------
call :collect_artifacts

echo.
echo ========================================
echo  [DONE] Build completed
echo ========================================
popd
exit /b 0

:: ============================================================================
:: Function definitions
:: ============================================================================

:: ---------- Check prerequisites ----------
:check_prerequisites
echo [INFO] Checking build environment...

set "MISSING="

where node >nul 2>&1
if errorlevel 1 (
    set "MISSING=!MISSING!  - Node.js  (https://nodejs.org)%NL%"
)

where npm >nul 2>&1
if errorlevel 1 (
    set "MISSING=!MISSING!  - npm%NL%"
)

where cargo >nul 2>&1
if errorlevel 1 (
    set "MISSING=!MISSING!  - Rust/cargo  (https://rustup.rs)%NL%"
)

where rustc >nul 2>&1
if errorlevel 1 (
    set "MISSING=!MISSING!  - rustc%NL%"
)

:: Check MSVC toolchain (cl.exe)
where cl >nul 2>&1
if errorlevel 1 (
    :: Try to find VS Build Tools
    if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" (
        echo [OK] Visual Studio is installed
    ) else (
        echo [WARN] cl.exe not found, please ensure Visual C++ Build Tools is installed
        echo        and run this script from "Developer Command Prompt" or "x64 Native Tools Command Prompt"
    )
)

if defined MISSING (
    echo [ERROR] Missing the following dependencies:
    echo !MISSING!
    echo Please install them and try again.
    exit /b 1
)

:: Show version info
echo.
for /f "tokens=*" %%v in ('node --version') do echo   Node.js: %%v
for /f "tokens=*" %%v in ('npm --version') do echo   npm:     %%v
for /f "tokens=*" %%v in ('rustc --version') do echo   Rust:    %%v
for /f "tokens=*" %%v in ('cargo --version') do echo   Cargo:   %%v
echo.
echo [OK] Build environment check passed
exit /b 0

:: ---------- Install dependencies ----------
:install_deps
echo.
echo ========================================
echo  Install frontend dependencies
echo ========================================

if exist "node_modules\react" (
    echo [OK] node_modules already exists, skipping install
    exit /b 0
)

echo [INFO] Running npm install ...
call npm ci --no-audit --no-fund
if errorlevel 1 (
    echo [WARN] npm ci failed, trying npm install ...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] npm dependency installation failed
        exit /b 1
    )
)
echo [OK] Frontend dependencies installed
exit /b 0

:: ---------- Build Tauri ----------
:build_tauri
echo.
echo ========================================
echo  Build Tauri application
echo  Target: x86_64-pc-windows-msvc
echo  Mode:   %BUILD_MODE%
echo ========================================

set "TAURI_ARGS="
if "%BUILD_MODE%"=="debug" (
    set "TAURI_ARGS=--debug"
)

echo [INFO] Running npx tauri build %TAURI_ARGS% ...
call npx tauri build %TAURI_ARGS%
if errorlevel 1 (
    echo [ERROR] Tauri build failed
    echo.
    echo Troubleshooting:
    echo   1. Make sure to use MSVC toolchain: rustup default stable-x86_64-pc-windows-msvc
    echo   2. Make sure Visual C++ Build Tools is installed
    echo   3. Make sure WebView2 Runtime is installed
    echo   4. Try cleaning and rebuilding: scripts\clean.bat
    exit /b 1
)
echo [OK] Tauri build completed
exit /b 0

:: ---------- Collect artifacts ----------
:collect_artifacts
echo.
echo ========================================
echo  Collect artifacts
echo ========================================

set "OUTPUT_DIR=%PROJECT_DIR%\build\release"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

set "BUNDLE_DIR=%PROJECT_DIR%\src-tauri\target"
set "FOUND=0"

:: Copy .msi
for /r "%BUNDLE_DIR%" %%f in (*.msi) do (
    echo [COPY] %%f
    copy /y "%%f" "%OUTPUT_DIR%\" >nul
    set "FOUND=1"
)

:: Copy NSIS .exe
if exist "%BUNDLE_DIR%\release\bundle\nsis\*.exe" (
    for %%f in ("%BUNDLE_DIR%\release\bundle\nsis\*.exe") do (
        echo [COPY] %%f
        copy /y "%%f" "%OUTPUT_DIR%\" >nul
        set "FOUND=1"
    )
)

echo.
echo ========================================
echo  Artifacts directory: %OUTPUT_DIR%
echo ========================================
if exist "%OUTPUT_DIR%\*" (
    dir /b "%OUTPUT_DIR%"
) else (
    echo (empty)
)
exit /b 0

:: ---------- Fail exit ----------
:fail
popd
echo.
echo [FAILED] Build failed, please check the errors above
exit /b 1
