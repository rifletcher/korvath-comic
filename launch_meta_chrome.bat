@echo off
title Meta AI Chrome Studio
echo Starting Chrome with remote debugging on port 9222...
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\research\c-book-generator\conan\.chrome_profile" "https://www.meta.ai"

