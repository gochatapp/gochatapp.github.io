@echo off
REM Pull the chatgo web UI assets FROM the chatgo app repo INTO this Pages repo.
REM Source : ..\..\chatgo\web\static\   (app.js, browser.html, browser_static.html, styles.css)
REM Dest   : repo root (..\)           -- existing files are OVERWRITTEN
REM Usage  : tools\sync_fromChatgo.bat  (works from any cwd / double-click)
REM Note   : files that are already identical are reported as SAME and left alone.
setlocal enabledelayedexpansion

set "FILES=app.js browser.html browser_static.html styles.css"
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
for %%I in ("%~dp0..\..\chatgo\web\static") do set "SRC=%%~fI"
set "DST=%ROOT%"
set "FAILED=0"
set "PULLED=0"
set "SAME=0"

if not exist "%SRC%\" echo [ERROR] Source not found: "%SRC%" & goto :fail
if not exist "%DST%\" echo [ERROR] Destination not found: "%DST%" & goto :fail

for %%F in (%FILES%) do (
  if not exist "%SRC%\%%F" (
    echo [MISSING] %%F  ^(not in "%SRC%"^)
    set "FAILED=1"
  ) else (
    fc /b "%SRC%\%%F" "%DST%\%%F" >nul 2>&1
    if not errorlevel 1 (
      echo [SAME   ] %%F
      set /a SAME+=1
    ) else (
      copy /Y "%SRC%\%%F" "%DST%\%%F" >nul
      if errorlevel 1 ( echo [FAILED ] %%F & set "FAILED=1" ) else ( echo [PULLED ] %%F & set /a PULLED+=1 )
    )
  )
)

if "!FAILED!"=="1" goto :fail
echo.
echo Done: !PULLED! file^(s^) pulled, !SAME! unchanged -- into "%ROOT%\"
echo Tip  : commit + push when the site should go live.
endlocal & exit /b 0

:fail
echo.
echo Finished with errors.
endlocal & exit /b 1
