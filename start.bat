@echo off
setlocal
title Croma Studio

set "ROOT=%~dp0"
set "API_PORT=4000"
set "FRONTEND_PORT=3000"
set "DATABASE_URL=postgresql://croma:croma_dev_password@localhost:5432/croma"

echo ==========================================
echo  CROMA STUDIO - INICIALIZACAO
echo ==========================================

where docker >nul 2>&1
if errorlevel 1 (
    echo ERRO: Docker nao foi encontrado no PATH.
    echo Instale ou abra o Docker Desktop e tente novamente.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo Docker Desktop nao esta pronto. Tentando iniciar...
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        start "Docker Desktop" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
        start "Docker Desktop" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo ERRO: Docker Desktop nao foi encontrado.
        pause
        exit /b 1
    )
    echo Aguardando o Docker Desktop...
    timeout /t 15 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        echo ERRO: Docker Desktop nao ficou disponivel.
        pause
        exit /b 1
    )
)

echo.
echo ==========================================
echo  INICIANDO POSTGRESQL
echo ==========================================
cd /d "%ROOT%"
docker compose up -d
if errorlevel 1 (
    echo ERRO: nao foi possivel iniciar o PostgreSQL.
    pause
    exit /b 1
)

set "POSTGRES_READY="
for /l %%i in (1,1,30) do (
    docker inspect --format="{{.State.Health.Status}}" croma-postgres 2>nul | findstr /i "healthy" >nul
    if not errorlevel 1 (
        set "POSTGRES_READY=1"
        goto postgres_ready
    )
    timeout /t 1 /nobreak >nul
)

:postgres_ready
if not defined POSTGRES_READY (
    echo ERRO: PostgreSQL nao ficou saudavel a tempo.
    docker compose logs --tail 30 postgres
    pause
    exit /b 1
)

echo PostgreSQL pronto.

echo.
echo ==========================================
echo  LIBERANDO PORTAS
echo ==========================================
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%API_PORT% "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT% "') do taskkill /f /pid %%a >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo ==========================================
echo  INICIANDO BACKEND - PORTA %API_PORT%
echo ==========================================
start "Croma Backend" /D "%ROOT%apps\backend" cmd /k "set PORT=%API_PORT%&& set DATABASE_URL=%DATABASE_URL%&& set FRONTEND_URL=http://localhost:%FRONTEND_PORT%&& npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ==========================================
echo  INICIANDO FRONTEND - PORTA %FRONTEND_PORT%
echo ==========================================
start "Croma Frontend" /D "%ROOT%apps\frontend" cmd /k "set NEXT_PUBLIC_API_URL=http://localhost:%API_PORT%&& npm run dev -- -p %FRONTEND_PORT%"

echo.
echo ==========================================
echo  SISTEMA INICIADO
echo ==========================================
echo  Frontend: http://localhost:%FRONTEND_PORT%
echo  API:      http://localhost:%API_PORT%
echo  Banco:    PostgreSQL via Docker Desktop
echo ==========================================
echo Feche as janelas dos servidores para parar frontend e API.
echo O banco permanece no Docker para preservar os dados.
echo.
pause
