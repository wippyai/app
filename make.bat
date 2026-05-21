@echo off
REM Windows cmd thin wrapper around make.ps1 — same target names as the Makefile.
REM Usage: make.bat            (defaults to "build")
REM        make.bat build
REM        make.bat clean-build
REM        make.bat lint
REM        make.bat build-app-main         (or any single module)

setlocal
set TARGET=%1
if "%TARGET%"=="" set TARGET=build

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make.ps1" -Target %TARGET%
exit /b %ERRORLEVEL%
