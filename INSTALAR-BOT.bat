@echo off
chcp 65001 >nul
title Avila Cell - INSTALADOR del Bot WhatsApp
color 0B
cd /d "%~dp0"

echo.
echo  ============================================================
echo     AVILA CELL  -  INSTALADOR DEL BOT DE WHATSAPP
echo  ============================================================
echo.
echo  Este instalador deja el bot listo en esta PC de sucursal.
echo  Solo se corre UNA VEZ. Despues usa INICIAR-BOT.
echo.
pause
echo.

REM ---------- 1. Verificar Node.js ----------
echo  [1/4] Verificando Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  X  Node.js NO esta instalado en esta PC.
    echo.
    echo     1. Se abrira la pagina de descarga de Node.js.
    echo     2. Descarga la version "LTS" e instalala ^(Siguiente, Siguiente, Finalizar^).
    echo     3. Cuando termines, vuelve a ejecutar este INSTALAR-BOT.
    echo.
    start "" https://nodejs.org/es/download
    pause
    exit /b
)
for /f "delims=" %%v in ('node -v') do echo      OK  Node.js %%v detectado
echo.

REM ---------- 2. Instalar dependencias ----------
echo  [2/4] Instalando dependencias del bot ^(puede tardar varios minutos^)...
echo.
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  X  Hubo un error instalando las dependencias.
    echo     Revisa tu conexion a internet y vuelve a correr INSTALAR-BOT.
    echo.
    pause
    exit /b
)
echo.
echo      OK  Dependencias instaladas.
echo.

REM ---------- 3. Crear accesos directos ----------
echo  [3/4] Creando accesos directos...

REM  Acceso directo en el Escritorio
powershell -NoProfile -Command ^
  "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Iniciar Bot Avila.lnk'); $s.TargetPath='%~dp0INICIAR-BOT.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,138'; $s.Save()"

echo      OK  Acceso directo creado en el Escritorio: "Iniciar Bot Avila"
echo.

REM ---------- 4. Inicio automatico al encender la PC ----------
echo  [4/4] Quieres que el bot se inicie SOLO al encender la PC?
set /p AUTO="     Escribe S para SI o N para NO y presiona Enter: "
if /i "%AUTO%"=="S" (
    powershell -NoProfile -Command ^
      "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Startup')+'\Bot Avila.lnk'); $s.TargetPath='%~dp0INICIAR-BOT.bat'; $s.WorkingDirectory='%~dp0'; $s.Save()"
    echo      OK  El bot arrancara automaticamente cada vez que enciendas la PC.
) else (
    echo      Saltado. Podras iniciarlo manualmente con el acceso del Escritorio.
)
echo.

REM ---------- Lanzar por primera vez para escanear el QR ----------
color 0A
echo  ============================================================
echo     INSTALACION COMPLETADA
echo  ============================================================
echo.
echo  Ahora se abrira el bot por primera vez.
echo  Cuando aparezca el CODIGO QR:
echo     1. Abre WhatsApp en el telefono de la sucursal
echo     2. Menu ^> Dispositivos vinculados ^> Vincular dispositivo
echo     3. Escanea el QR de esta pantalla
echo.
echo  Panel de administracion: http://localhost:3001
echo.
pause
echo.
node index.js
pause
