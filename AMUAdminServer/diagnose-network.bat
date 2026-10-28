@echo off
REM AMU Admin Server - Network Diagnostic Tool

echo ========================================
echo AMU Admin Server - Network Diagnostics
echo ========================================
echo.

echo [1/6] Checking your IP address...
echo ----------------------------------------
ipconfig | findstr /C:"IPv4 Address"
echo.

echo [2/6] Checking if port 3000 is listening...
echo ----------------------------------------
netstat -an | findstr ":3000"
if %ERRORLEVEL% EQU 0 (
    echo ✓ Port 3000 is being used
    echo.
    echo NOTE: If you see "127.0.0.1:3000" only, the server is bound to localhost only.
    echo      You need to see "0.0.0.0:3000" for network access.
) else (
    echo ✗ Port 3000 is not being used
    echo   Start the AMU Admin Server first!
)
echo.

echo [3/6] Checking Windows Firewall status...
echo ----------------------------------------
netsh advfirewall show allprofiles state | findstr "State"
echo.

echo [4/6] Checking for AMU Admin Server firewall rules...
echo ----------------------------------------
netsh advfirewall firewall show rule name="AMU Admin Server - Port 3000 (TCP)" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✓ Firewall rule exists for AMU Admin Server
    netsh advfirewall firewall show rule name="AMU Admin Server - Port 3000 (TCP)"
) else (
    echo ✗ No firewall rule found!
    echo   Run "configure-firewall.bat" as Administrator to fix this.
)
echo.

echo [5/6] Checking network profile...
echo ----------------------------------------
powershell -Command "Get-NetConnectionProfile | Select-Object Name, NetworkCategory"
echo.
echo NOTE: "Private" is recommended. "Public" may have stricter firewall rules.
echo.

echo [6/6] Testing local connectivity...
echo ----------------------------------------
echo Attempting to connect to localhost:3000...
powershell -Command "$client = New-Object System.Net.Sockets.TcpClient; try { $client.Connect('localhost', 3000); Write-Host '✓ Can connect to localhost:3000'; $client.Close() } catch { Write-Host '✗ Cannot connect to localhost:3000 - Is the server running?' }"
echo.

echo ========================================
echo Diagnostic Summary
echo ========================================
echo.
echo QUICK CHECKLIST:
echo.
echo [ ] Server is running (check if port 3000 is listening above)
echo [ ] Port 3000 shows "0.0.0.0:3000" not "127.0.0.1:3000"
echo [ ] Firewall rule exists (check above)
echo [ ] Windows Firewall is ON (if OFF, no rules are applied)
echo [ ] Network is set to "Private" (check above)
echo.
echo If any of the above are missing, you need to:
echo 1. Start the AMU Admin Server
echo 2. Run "configure-firewall.bat" as Administrator
echo 3. Set network profile to Private (if Public)
echo.
echo ========================================
echo Access URLs:
echo ========================================
echo.
echo From this PC: http://localhost:3000/admin
echo.
echo From other devices (use your IPv4 address from above):
echo Example: http://192.168.1.100:3000/admin
echo.
pause
