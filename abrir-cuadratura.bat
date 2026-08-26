@echo off
setlocal
cd /d "%~dp0"

set "PGDATA=%~dp0.pgdata"
set "PGBIN=C:\Program Files\PostgreSQL\18\bin"
set "DATABASE_URL=postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial"

echo Arrancando Cuadratura...

"%PGBIN%\pg_isready.exe" -h localhost -p 55433 >nul 2>&1
if errorlevel 1 (
  echo  - Postgres
  "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%PGDATA%\postgres.log" -o "-p 55433" start
)

netstat -ano | findstr ":3000" | findstr LISTENING >nul
if errorlevel 1 (
  echo  - API
  start "Cuadratura API" cmd /k "cd /d "%~dp0" && set DATABASE_URL=%DATABASE_URL% && npm run dev:api"
)

netstat -ano | findstr ":5173" | findstr LISTENING >nul
if errorlevel 1 (
  echo  - Web
  start "Cuadratura Web" cmd /k "cd /d "%~dp0" && npm run dev:web"
)

echo Esperando http://localhost:5173 ...
set /a n=0
:wait
set /a n+=1
if %n% gtr 60 (
  echo No arranco la web. Mira la ventana "Cuadratura Web".
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri http://localhost:5173 -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -ge 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait
)

start "" http://localhost:5173/inspectores
echo Listo.
endlocal
