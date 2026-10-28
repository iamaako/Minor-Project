# AMU Admin Server - Firewall Configuration Script
# Run this script as Administrator to allow incoming connections

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AMU Admin Server - Firewall Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Right-click this script and select 'Run with PowerShell as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit
}

Write-Host "Creating firewall rule for Port 3000..." -ForegroundColor Yellow

# Remove existing rules if they exist
Write-Host "Removing any existing rules..." -ForegroundColor Gray
netsh advfirewall firewall delete rule name="AMU Admin Server - Port 3000 (TCP)" 2>$null
netsh advfirewall firewall delete rule name="AMU Admin Server - Port 3000 (UDP)" 2>$null

# Add new inbound rule for TCP port 3000
Write-Host "Adding TCP rule for port 3000..." -ForegroundColor Green
netsh advfirewall firewall add rule name="AMU Admin Server - Port 3000 (TCP)" dir=in action=allow protocol=TCP localport=3000 profile=any

# Add new inbound rule for UDP port 3000 (for good measure)
Write-Host "Adding UDP rule for port 3000..." -ForegroundColor Green
netsh advfirewall firewall add rule name="AMU Admin Server - Port 3000 (UDP)" dir=in action=allow protocol=UDP localport=3000 profile=any

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Firewall configuration completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Port 3000 is now open for incoming connections." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Start the AMU Admin Server application" -ForegroundColor White
Write-Host "2. Note your IP address (shown in the app)" -ForegroundColor White
Write-Host "3. Access from other devices using: http://YOUR-IP:3000/admin" -ForegroundColor White
Write-Host ""
Write-Host "Example: http://192.168.1.100:3000/admin" -ForegroundColor Yellow
Write-Host ""

# Test if the firewall rule was created successfully
Write-Host "Verifying firewall rules..." -ForegroundColor Cyan
$rules = netsh advfirewall firewall show rule name="AMU Admin Server - Port 3000 (TCP)"
if ($rules -match "Ok") {
    Write-Host "✓ Firewall rules successfully created!" -ForegroundColor Green
} else {
    Write-Host "⚠ Warning: Could not verify firewall rules" -ForegroundColor Yellow
}

Write-Host ""
pause
