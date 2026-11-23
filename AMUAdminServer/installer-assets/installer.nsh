; Extra NSIS settings for the AMU Admin Server installer (included through build.nsis.include).

; ── Finish page text ──
; customPageAfterChangeDir is expanded by electron-builder right before the install-progress
; page and the Finish page are created, so this define is seen by MUI_PAGE_FINISH.
; (customHeader is NOT usable for this: it is expanded after the pages already exist.)
!macro customPageAfterChangeDir
  !define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} has been installed on your computer.$\r$\n$\r$\nClick Finish to close Setup.$\r$\n$\r$\n$\r$\nDeveloped in$\r$\nInterdisciplinary Centre for Artificial Intelligence$\r$\n$\r$\nDeveloped by$\r$\nAARIF KHAN (24AIBEA142)$\r$\nARQAM AHMAD (24AIBEA129)$\r$\n$\r$\nUnder: Dr. Junaid Ali Reshi"
!macroend

; ── Windows Firewall ──
; Without an inbound rule, Windows blocks every other device from reaching the server
; (students and the web dashboard on a phone). The setup already runs as administrator,
; so it adds the rules itself instead of relying on the first-run pop-up, which is easy to
; miss or answer with "Private networks only" (a laptop hotspot counts as Public).
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="AMU Admin Server"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall delete rule name="AMU Admin Server (TCP 3000)"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="AMU Admin Server" dir=in action=allow program="$INSTDIR\${PRODUCT_FILENAME}.exe" enable=yes profile=any'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="AMU Admin Server (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 enable=yes profile=any'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="AMU Admin Server"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall delete rule name="AMU Admin Server (TCP 3000)"'
  Pop $0
!macroend