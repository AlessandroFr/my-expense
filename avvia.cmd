@echo off
REM Avvia My Expense senza XAMPP: il web server integrato di PHP serve public/,
REM poi si apre la finestra dell'app. Chiudere questa finestra spegne l'app.
REM
REM Nota: finche' il database e' MySQL serve mysqld avviato. Sparira' con il
REM passaggio a SQLite.

setlocal
cd /d "%~dp0"

set PORT=8080

REM --app= apre una finestra senza barra degli indirizzi: sembra un'app, non una
REM scheda del browser. Se Edge non c'e', si ripiega sul browser predefinito.
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if exist "%EDGE%" (
    start "" "%EDGE%" --app=http://127.0.0.1:%PORT%/
) else (
    start "" http://127.0.0.1:%PORT%/
)

echo My Expense e' in ascolto su http://127.0.0.1:%PORT%/
echo Chiudi questa finestra per spegnerlo.
php -S 127.0.0.1:%PORT% -t public public\router.php

endlocal
