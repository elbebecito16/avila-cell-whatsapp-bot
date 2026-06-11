@echo off
chcp 65001 >nul
title Avila Cell - Bot WhatsApp
color 0A
cd /d "%~dp0"

echo.
echo  ==========================================
echo    AVILA CELL - Bot WhatsApp de Precios
echo  ==========================================
echo.

REM  Si no esta instalado, mandar a correr el instalador
if not exist "node_modules" (
    color 0E
    echo  El bot todavia no esta instalado en esta PC.
    echo  Cierra esta ventana y ejecuta primero: INSTALAR-BOT
    echo.
    pause
    exit /b
)

echo  Iniciando bot...
echo  Si aparece un codigo QR, escanealo con WhatsApp
echo  ^(Dispositivos vinculados ^> Vincular dispositivo^).
echo.
echo  Panel admin: http://localhost:3001
echo.

:reinicio
node index.js
echo.
echo  ----------------------------------------------------------
echo  El bot se detuvo. Reiniciando en 5 segundos...
echo  ^(Cierra esta ventana para apagarlo del todo^)
echo  ----------------------------------------------------------
timeout /t 5 >nul
goto reinicio
