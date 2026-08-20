@echo off
REM Avvia My Expense. Chiudere questa finestra spegne l'app.
REM
REM Durante la migrazione girano due processi: Node sta davanti sulla porta
REM 8080 e serve gli endpoint gia' riscritti, PHP sta dietro sulla 8081 e serve
REM tutto il resto. Quando l'ultimo dominio sara' passato a Node, PHP sparisce.

setlocal
cd /d "%~dp0"

set PORT=8080
set PHP_PORT=8081

REM PHP dietro, in una finestra minimizzata
start "My Expense (PHP)" /min php -S 127.0.0.1:%PHP_PORT% -t public public\router.php

REM --app= apre una finestra senza barra degli indirizzi: sembra un'app, non
REM una scheda del browser. Se Edge non c'e', si ripiega sul browser di sistema.
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if exist "%EDGE%" (
    start "" "%EDGE%" --app=http://127.0.0.1:%PORT%/
) else (
    start "" http://127.0.0.1:%PORT%/
)

node server\index.js

REM Alla chiusura porta via anche il processo PHP.
taskkill /FI "WINDOWTITLE eq My Expense (PHP)*" /T /F >nul 2>&1
endlocal
