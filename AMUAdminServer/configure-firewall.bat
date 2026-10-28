@echo off
REM AMU Admin Server - Firewall Configuration Script
REM Run this as Administrator

echo ========================================
echo AMU Admin Server - Firewall Setup
echo ========================================
echo.

REM Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo Configuring Windows Firewall...
echo.

REM Remove existing rules
echo Removing any existing rules...
netsh advfirewall firewall delete rule name="AMU Admin Server - Port 3000 (TCP)" >nul 2>&1
netsh advfirewall firewall delete rule name="AMU Admin Server - Port 3000 (UDP)" >nul 2>&1

REM Add new firewall rules
echo Adding firewall rule for TCP port 3000...
netsh advfirewall firewall add rule name="AMU Admin Server - Port 3000 (TCP)" dir=in action=allow protocol=TCP localport=3000 profile=any

echo Adding firewall rule for UDP port 3000...
netsh advfirewall firewall add rule name="AMU Admin Server - Port 3000 (UDP)" dir=in action=allow protocol=UDP localport=3000 profile=any

echo.
echo ========================================
echo Firewall configuration completed!
echo ========================================
echo.
echo Port 3000 is now open for incoming connections.
echo.
echo Next steps:
echo 1. Start the AMU Admin Server application
echo 2. Note your IP address (shown in the app)
echo 3. Access from other devices: http://YOUR-IP:3000/admin
echo.
echo Example: http://192.168.1.100:3000/admin
echo.
pause
