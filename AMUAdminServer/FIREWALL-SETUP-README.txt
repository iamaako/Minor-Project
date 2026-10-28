================================================================================
AMU ADMIN SERVER - FIREWALL CONFIGURATION
================================================================================

PROBLEM: Admin Dashboard not accessible from other devices (mobile, laptops)
SOLUTION: Configure Windows Firewall to allow incoming connections on port 3000

================================================================================
QUICK FIX - 3 EASY STEPS:
================================================================================

1. RIGHT-CLICK on "configure-firewall.bat" file
2. SELECT "Run as administrator"
3. CLICK "Yes" when Windows asks for permission

That's it! Your firewall is now configured.

================================================================================
MANUAL METHOD (If script doesn't work):
================================================================================

1. Press Windows + R
2. Type: firewall.cpl
3. Click "Allow an app or feature through Windows Defender Firewall"
4. Click "Change settings" (Administrator required)
5. Click "Allow another app..."
6. Browse and select "AMU Admin Server.exe"
7. Check BOTH "Private" and "Public" boxes
8. Click OK

================================================================================
HOW TO ACCESS ADMIN DASHBOARD:
================================================================================

FROM THIS PC:
http://localhost:3000/admin

FROM OTHER DEVICES (Mobile, Laptops):
http://YOUR-IP-ADDRESS:3000/admin

Example: http://192.168.1.100:3000/admin

To find your IP:
- Open Command Prompt
- Type: ipconfig
- Look for "IPv4 Address"

================================================================================
VERIFICATION:
================================================================================

After running the script:
1. Start AMU Admin Server
2. Check the logs - you should see your IP address
3. On another device (same WiFi), open browser
4. Go to: http://YOUR-IP:3000/admin
5. Login page should appear!

================================================================================
TROUBLESHOOTING:
================================================================================

Still not working? Check these:

√ Both devices on SAME WiFi network?
√ Server is running?
√ Using correct IP (not 127.0.0.1)?
√ Tried clearing mobile browser cache?
√ Antivirus software blocking? (temporarily disable to test)
√ Router has AP Isolation disabled?

================================================================================
IMPORTANT NOTES:
================================================================================

- You must run the script AS ADMINISTRATOR
- You must RESTART Admin Server after configuring firewall
- Mobile devices must be on the SAME WiFi network as the server
- Use http:// NOT https://
- Port 3000 must not be used by another application

================================================================================
FILES IN THIS FOLDER:
================================================================================

configure-firewall.bat - Windows batch script (easier to use)
configure-firewall.ps1 - PowerShell script (alternative)
FIREWALL-SETUP-README.txt - This file

================================================================================
NEED MORE HELP?
================================================================================

For detailed troubleshooting and advanced configuration, see the complete
guide provided by the developer.

Common commands:

Check if port is listening:
netstat -an | findstr :3000

Check firewall rules:
netsh advfirewall firewall show rule name=all | findstr "3000"

Get your IP address:
ipconfig

================================================================================
