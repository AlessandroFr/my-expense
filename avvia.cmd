@echo off
REM Avvia My Expense. Chiudere questa finestra spegne l'app.

setlocal
cd /d "%~dp0"

set PORT=8080

REM --app= apre una finestra senza barra degli indirizzi: sembra un'app, non
REM una scheda del browser. Se Edge non c'e', si ripiega sul browser di sistema.
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if exist "%EDGE%" (
    start "" "%EDGE%" --app=http://127.0.0.1:%PORT%/
) else (
    start "" http://127.0.0.1:%PORT%/
)

node server\index.js

endlocal
