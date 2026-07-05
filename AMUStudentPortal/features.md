# AMU Secure Test Portal — Project Features & Architecture Specification

Dono (Client-Server) sides ke saare features, security protocol aur future requirements ka central document:

---

## 1. System Architecture Overview

```
                   [ Local Wi-Fi Router / LAN ]
                               |
        +----------------------+----------------------+
        |                                             |
[ Teacher PC (Local Server) ]               [ Student Client PCs ]
- Node.js running backend                   - Electron.js Desktop App
- Generates dynamic Admin ID/Pass           - Inputs Server IP & Port
- Hosts Admin Web Portal (/admin)            - Local Compiler Execution (Python/GCC)
- Tracks active exam states                  - Hardened Anti-Cheat Shell
```

---

## 2. Core Features (Completed & Proposed)

### A. Dynamic Server & Admin Initialization (Teacher Side)
* [ ] **Dynamic Admin Credentials:** Jab server execute ho, toh terminal/console window par temporary `Admin Username` aur `Password` dynamically generate ho, jo har start par unique ho.
* [ ] **Admin Portal Route:** Browser par `http://server-ip:port/admin` se access ho jahan teacher login kar sakein.
* [ ] **LAN Broadcast Display:** Server start hote hi active Local LAN IP aur Port output screen par print kare, taaki board par likha ja sake.

### B. Setup & Handshake Flow (Student Side)
* [ ] **Manual Server Target IP & Port:** Startup par Electron welcome screen student se target `Server IP` aur `Port` fill karwaye.
* [ ] **Network Auto-Detect & Handshake:** Client system ka local IP automatic detect karke server par connection test confirmation ping send ho.
* [ ] **Logon Verification:** Student ka `Enrollment / Roll Number` aur `Exam Password` validation secure socket API call se cross-verify ho.

### C. Active Session Security & Device Binding (Crucial Feature)
* [ ] **IP-Enrollment Lock:** Ek baar kisi Enrollment Number se kisi specific client IP par login ho gaya, toh server us IP aur Enrollment No. ko bind kar dega.
* [ ] **Strict Double-Login Restriction:** Agar wahi same Enrollment Number kisi doosre computer par login karne ki koshish karega, toh server authentication block kar dega.
* [ ] **Admin Unbind Trigger:** Agar student ka computer fail/freeze ho jata hai aur invigilator use doosre system par shift karta hai, toh Admin Portal par **"Unbind Session"** button trigger hoga, jo database se us system ki binding mapping clear karega.
* [ ] **State Recovery (Auto-Resume):** Unbind hone ke baad student jab naye system se login karega, toh bacha hua timer balance aur Monaco Editor mein saved code buffers wapas local server se load ho jayenge.

### D. Testing & Local Code Sandbox
* [ ] **Split-Screen Console Layout:** Left panel par markdown question files, right panel par Monaco Editor, aur bottom par terminal screen layout.
* [ ] **No-Cloud Local Execution:** Node.js `child_process` compiler commands use karke, client computer ke native resources se Python scripts aur GCC bin codes ko local compile aur run karna.
* [ ] **Hard Infinite Loop Timeout:** Strict 5-second (5000ms) execution sandbox timeout run, jo systems ko lock hone se bachata hai.

### E. Anti-Cheat & Invigilator Controls
* [ ] **Electron Kiosk Lockdown:** Full-screen kiosk mode, frames/menu block, aur browser console disables interface.
* [ ] **Focus Tracker API:** `visibilitychange` API ke through browser/OS windows switch detect karna, warnings show karna aur events immediate admin portal par push karna.
* [ ] **Force Lock Remote Command:** Invigilator single click se target student window lock kar sake.
* [ ] **Pause/Resume Control:** Globally poore exam hall ka compile/input system freeze aur un-freeze karne ka protocol command.

---

## 3. Developer Testing Setup (1 PC Workflow)

* **Single Machine Simulation:** Single PC par 1 Node server instance aur 2+ Electron instances separate configurations ke sath open karke, concurrent users aur seat conflicts ko asani se test kiya ja sakta hai.
