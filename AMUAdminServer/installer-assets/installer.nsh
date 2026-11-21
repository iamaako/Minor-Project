; Extra NSIS settings for the AMU installers (included through build.nsis.include).
;
; customPageAfterChangeDir is expanded by electron-builder right before the install-progress
; page and the Finish page are created, so this define is seen by MUI_PAGE_FINISH.
; (customHeader is NOT usable for this: it is expanded after the pages already exist.)

!macro customPageAfterChangeDir
  ; Text on the last wizard page ("Completing ... Setup")
  !define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} has been installed on your computer.$\r$\n$\r$\nClick Finish to close Setup.$\r$\n$\r$\n$\r$\nDeveloped in$\r$\nInterdisciplinary Centre for Artificial Intelligence$\r$\n$\r$\nby  Aarif Khan (24AIBEA142)$\r$\n      Arqam Ahmad (24AIBEA129)$\r$\n$\r$\nUnder: Dr. Junaid Ali Reshi"
!macroend