@echo off
cd /d "%~dp0"
rem A newer build waiting? Swap it in before starting.
if exist conan-studio-new.exe (
  move /y conan-studio-new.exe conan-studio.exe >nul || (
    echo Could not replace conan-studio.exe - close the running Studio first, then run this again.
    pause
    exit /b 1
  )
)
echo Starting Conan Multi-Comic Studio...
conan-studio.exe --port 8484 --window
