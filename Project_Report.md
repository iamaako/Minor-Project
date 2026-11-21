
# AMU Online Examination Portal
## A Secure, AI-Proctored Computer-Based Examination System

---

<div align="center">

**A Minor Project Report**
Submitted in partial fulfilment of the requirements for the degree of

**Bachelor of Technology**
in
**Computer Science & Engineering / Information Technology**

---

**Submitted By:**

Aarif Khan
AMU Interdisciplinary Centre for Artificial Intelligence
Aligarh Muslim University, Aligarh

**Under the Guidance of:**

[Supervisor Name]
Department of Computer Science
Aligarh Muslim University, Aligarh

---

**Academic Year: 2026–27**

</div>

---

## CERTIFICATE

*This is to certify that the minor project entitled "AMU Online Examination Portal — A Secure, AI-Proctored Computer-Based Examination System" has been carried out by Aarif Khan under our supervision, in partial fulfilment of the requirements for the award of the degree of Bachelor of Technology from Aligarh Muslim University, Aligarh. The work is genuine and has not been submitted elsewhere for the award of any degree or diploma.*

**Supervisor:**
[Supervisor Name]
Department of Computer Science
Aligarh Muslim University, Aligarh

**Date:** November 2026
**Place:** Aligarh

---

## DECLARATION

*I hereby declare that the project entitled "AMU Online Examination Portal" submitted to Aligarh Muslim University is a record of original work done by me under the supervision of [Supervisor Name]. This project work has not been previously submitted for any other degree or diploma to any university or institution.*

**Aarif Khan**
AMU Interdisciplinary Centre for Artificial Intelligence
Date: November 2026

---

## ACKNOWLEDGEMENT

I extend my sincere gratitude to my project supervisor [Supervisor Name] for the invaluable guidance and support throughout this project. I am thankful to the Department of Computer Science, Aligarh Muslim University, for providing the resources and environment to carry out this work.

I also thank my colleagues and friends who offered their feedback and assistance during the development and testing phases of this project.

---

## ABSTRACT

The **AMU Online Examination Portal** is a comprehensive, desktop-based, kiosk-locked examination platform designed specifically for the computer labs of Aligarh Muslim University. The system comprises two Electron-based desktop applications: an **Admin Server** (for invigilators and teachers) and a **Student Portal** (for exam candidates).

The portal addresses critical shortcomings of traditional pen-and-paper and unproctored online exams. It enforces a secure, fullscreen kiosk mode, blocks all system shortcuts and task-switching, and employs a real-time **AI-based webcam proctoring** engine built on MediaPipe's facial landmark technology. The system supports multi-language code execution (Python, C, C++) via sandboxed child processes, real-time synchronisation over Socket.io, hardware-locked licensing, and automated workspace submission.

The result is an end-to-end, offline-capable examination platform that significantly reduces malpractice and administrative overhead in computer-science practical examinations.

**Keywords:** Electron, Kiosk Mode, AI Proctoring, MediaPipe, Socket.io, Secure Examination, Node.js, SQLite, Code Execution.

---

## TABLE OF CONTENTS

| Chapter | Title | Page |
|---------|-------|------|
| 1 | Introduction | 1 |
| 2 | Literature Review | 3 |
| 3 | System Requirements | 5 |
| 4 | System Architecture & Design | 7 |
| 5 | Modules & Implementation | 11 |
| 6 | Database Design | 20 |
| 7 | Security Features | 23 |
| 8 | Testing & Results | 26 |
| 9 | Conclusion & Future Work | 29 |
| — | References | 31 |
| — | Appendix A – Source Code Listing | 33 |

---

## LIST OF FIGURES

| Figure No. | Title |
|-----------|-------|
| Fig. 4.1 | High-Level System Architecture Diagram |
| Fig. 5.1 | Student Portal – Setup / License Screen |
| Fig. 5.2 | Student Portal – Login Screen |
| Fig. 5.3 | Student Portal – Exam Interface (Code Editor) |
| Fig. 5.4 | Student Portal – Webcam Proctoring Widget |
| Fig. 5.5 | Admin Server – Screen Viewer |
| Fig. 5.6 | Admin Server – Dashboard Overview |
| Fig. 5.7 | Admin Server – Live Student Monitoring |
| Fig. 6.1 | Database Entity-Relationship Diagram |
| Fig. 8.1 | Running Exam — Full Interface |
| Fig. 8.2 | Admin Dashboard During Live Exam |

---

## LIST OF ABBREVIATIONS

| Abbreviation | Full Form |
|---|---|
| AMU | Aligarh Muslim University |
| AI | Artificial Intelligence |
| API | Application Programming Interface |
| CBT | Computer-Based Test |
| CPU | Central Processing Unit |
| CSS | Cascading Style Sheets |
| DB | Database |
| FPS | Frames Per Second |
| HTML | HyperText Markup Language |
| IPC | Inter-Process Communication |
| JS | JavaScript |
| JSON | JavaScript Object Notation |
| JWT | JSON Web Token |
| LAN | Local Area Network |
| OS | Operating System |
| REST | Representational State Transfer |
| SQL | Structured Query Language |
| UI | User Interface |
| URL | Uniform Resource Locator |
| UUID | Universally Unique Identifier |

---

# CHAPTER 1: INTRODUCTION

## 1.1 Background

Aligarh Muslim University (AMU) conducts numerous practical and theory examinations for its computer science students every academic year. Traditionally, these examinations were conducted using pen-and-paper methods, which are unsuitable for assessing programming skills that require actual code writing and execution. With the advent of Computer-Based Testing (CBT), several issues emerged, including:

- Students switching between browser tabs to access reference material.
- Use of external USB devices to copy pre-written code.
- Collaboration via chat apps or screen-sharing tools during exams.
- No real-time visibility for invigilators across multiple lab machines.
- Manual, error-prone paper collection and evaluation.

The **AMU Online Examination Portal** was designed to address all of these challenges within a university lab environment.

## 1.2 Problem Statement

Existing online examination tools (Google Forms, Moodle quizzes, etc.) are not suitable for programming examinations because:

1. They run inside a browser that can be minimised or switched away from.
2. They do not support code compilation and execution.
3. They offer no AI-based proctoring for head-pose or presence detection.
4. They are dependent on a stable internet connection.
5. They do not provide real-time monitoring of student activity to invigilators.

There is a clear need for a **dedicated, lockdown-capable desktop application** that runs directly on lab machines, provides a fully integrated code editor, executes code securely, and streams live status to the invigilator's dashboard.

## 1.3 Objectives

The primary objectives of this project are:

1. Develop a **secure kiosk-mode student portal** that prevents access to any other application during the exam.
2. Implement a **real-time AI webcam proctoring** engine to detect when a student looks away or is absent.
3. Provide an **integrated Monaco code editor** supporting Python, C, and C++.
4. Build an **Admin Server** that allows teachers to manage students, questions, and monitor live activity.
5. Enable **hardware-locked licensing** to prevent unauthorised deployment of the portal.
6. Support **offline operation** with a local SQLite database and portable runtime tools.
7. Ensure **automatic workspace upload** upon exam submission for persistent record-keeping.

## 1.4 Scope of the Project

The project covers:
- Two desktop applications (Admin Server & Student Portal) for Windows environments.
- A local-area-network (LAN) based communication model — no internet required.
- Real-time exam management (start, schedule, pause, resume, force-submit).
- Code execution for Python 3, C, and C++ using portable embedded runtimes.
- AI-based proctoring using MediaPipe's Face Detector API.
- Student submission storage and teacher-side code evaluation.

The project does **not** include cloud hosting, online judge auto-grading, or mobile platforms.

## 1.5 Report Organisation

The rest of this report is organised as follows: Chapter 2 reviews related work. Chapter 3 discusses system requirements. Chapter 4 covers system architecture. Chapter 5 describes each module and its implementation. Chapter 6 covers the database design. Chapter 7 discusses security features. Chapter 8 presents testing and results. Chapter 9 concludes with future work.

---

# CHAPTER 2: LITERATURE REVIEW

## 2.1 Existing Examination Systems

Several commercial and open-source examination systems have been studied:

| System | Type | Proctoring | Code Execution | Offline |
|--------|------|------------|---------------|---------|
| HackerRank | Web | Basic | Yes | No |
| Moodle | Web | Plugin-based | No | No |
| Talview | Web | AI | No | No |
| Safe Exam Browser (SEB) | Desktop | Lockdown Only | No | Partial |
| ExamSoft | Desktop | AI + Lockdown | No | Partial |

None of the above systems combines kiosk lockdown, AI proctoring, integrated code execution, and a fully local LAN-based deployment, which is exactly the gap this project fills.

## 2.2 Electron Framework for Desktop Applications

Electron (developed by GitHub) allows building cross-platform desktop applications using web technologies (HTML, CSS, JavaScript). It wraps a Chromium rendering engine and a Node.js runtime. Its IPC (Inter-Process Communication) bridge between the main process and renderer process makes it suitable for security-sensitive applications where the renderer should not have direct Node.js access.

**Key advantage for this project:** Electron's `kiosk` mode and `globalShortcut` API allow complete lockdown of the system UI, something impossible in a web browser alone.

## 2.3 MediaPipe for Real-Time Facial Analysis

MediaPipe (Google) is an open-source framework for machine learning pipelines. Its `FaceDetector` and `FaceLandmarker` tasks can detect facial bounding boxes and 3D facial landmark coordinates at 30+ FPS on consumer hardware.

In this project, the **camera-proctor module** uses MediaPipe's `FaceLandmarker` task (via `@mediapipe/tasks-vision`) to detect:
- Head pose (left/right deviation from centre).
- Face presence/absence.
- Camera obstruction.

## 2.4 Socket.io for Real-Time Communication

Socket.io is a JavaScript library that enables real-time, event-based communication between servers and clients over WebSockets (with HTTP long-polling fallback). Its automatic reconnection logic is critical for maintaining exam sessions during transient LAN connectivity issues.

## 2.5 Monaco Editor

Monaco Editor is the same code editor that powers Visual Studio Code. It provides syntax highlighting, IntelliSense, and line numbering for all major programming languages. Embedding it in the Student Portal offers students a familiar, comfortable coding environment.

---

# CHAPTER 3: SYSTEM REQUIREMENTS

## 3.1 Hardware Requirements

### Admin Server Machine (Invigilator's PC)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Processor | Intel Core i3 | Intel Core i5 / Ryzen 5 |
| RAM | 4 GB | 8 GB |
| Storage | 10 GB free | 50 GB free |
| Network | 100 Mbps LAN | Gigabit LAN |
| OS | Windows 10 | Windows 10/11 |

### Student Lab Machine

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Processor | Intel Core i3 | Intel Core i5 |
| RAM | 4 GB | 8 GB |
| Storage | 5 GB free | 10 GB free |
| Camera | 480p Webcam | 720p HD Webcam |
| Network | 100 Mbps LAN | Gigabit LAN |
| OS | Windows 10 | Windows 10/11 |

## 3.2 Software Requirements

### Development Environment

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | v20+ | JavaScript runtime |
| Electron | v35.x | Desktop app framework |
| Bun | v1.x | Package manager (Admin Server) |
| npm | v9+ | Package manager (Student Portal) |
| electron-builder | v24.x | Packaging & installer generation |

### Runtime Dependencies (Student Portal)

| Package | Version | Purpose |
|---------|---------|---------|
| `socket.io-client` | 4.8.0 | Server communication |
| `@mediapipe/tasks-vision` | 1.2.3 | AI face detection |
| `monaco-editor` | 0.52.2 | Code editor |
| `archiver` / `adm-zip` | — | Workspace compression |
| `uuid` | 11.1.0 | Unique token generation |

### Runtime Dependencies (Admin Server)

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | 4.21.2 | HTTP server & REST API |
| `socket.io` | 4.8.1 | Real-time server |
| `sql.js` | 1.14.1 | SQLite in pure JavaScript |
| `jsonwebtoken` | 9.0.3 | Admin authentication tokens |
| `multer` | 2.2.0 | File upload handling |
| `csv-parse` | 7.0.0 | Bulk student CSV import |

### Portable Tools (bundled with installer)

| Tool | Purpose |
|------|---------|
| Python 3 Embedded | Python code execution (no system Python needed) |
| MinGW-w64 (GCC/G++) | C and C++ compilation & execution |

---

# CHAPTER 4: SYSTEM ARCHITECTURE & DESIGN

## 4.1 High-Level Architecture

The system follows a **Client-Server architecture** operating over a local area network:

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOCAL AREA NETWORK (LAN)                 │
│                                                                 │
│  ┌─────────────────────────┐       ┌──────────────────────────┐ │
│  │    ADMIN SERVER         │       │   STUDENT PORTAL (N×)    │ │
│  │  (Invigilator Machine)  │◄─────►│  (Each Lab Machine)      │ │
│  │                         │       │                          │ │
│  │  • Express HTTP Server  │       │  • Electron Kiosk App    │ │
│  │  • Socket.io Server     │       │  • Monaco Code Editor    │ │
│  │  • Admin Dashboard UI   │       │  • AI Camera Proctor     │ │
│  │  • SQLite Database      │       │  • Socket.io Client      │ │
│  │  • Student Management   │       │  • Code Executor         │ │
│  │  • Live Monitoring      │       │  • Hardware License      │ │
│  └─────────────────────────┘       └──────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

> **Note:** The system is **completely self-contained within the LAN**. No internet connection is required during the exam. The Admin Server acts as the single point of authority.

**[Figure 4.1 — System Architecture Diagram]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║          [ SCREENSHOT / DIAGRAM PLACEHOLDER ]                ║
║                                                              ║
║      Insert System Architecture Block Diagram here           ║
║      (Draw.io / Visio / Hand-drawn diagram photo)            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

## 4.2 Two-Application Design

### 4.2.1 AMU Admin Server

A standalone Electron desktop application that:
- Embeds an Express.js + Socket.io server listening on port 3000.
- Provides a web-based Admin Dashboard accessible at `http://localhost:3000/admin`.
- Stores all data in a SQLite database (`AMU_Exam_Database.sqlite`) in the user's Documents folder.
- Receives live data from all connected student clients.

### 4.2.2 AMU Student Portal

A standalone Electron desktop application that:
- Runs in **fullscreen kiosk mode** on each student machine.
- Connects to the Admin Server via Socket.io using the invigilator's IP address.
- Presents the exam interface after hardware license verification and student authentication.
- Executes code using bundled Python and GCC runtimes.

## 4.3 Process Architecture (Electron)

Both applications follow Electron's **main process / renderer process** separation:

```
Electron App
│
├── Main Process (Node.js)
│   ├── Window creation & lifecycle
│   ├── Keyboard lockdown (globalShortcut)
│   ├── Socket.io client/server
│   ├── Code execution (child processes)
│   ├── File system access
│   └── IPC handlers
│
└── Renderer Process (Chromium — Sandboxed)
    ├── HTML/CSS/JS UI
    ├── Monaco Editor
    ├── Camera Proctoring (WebRTC + MediaPipe)
    └── Communicates via preload.js (contextBridge)
```

> **Important:** `nodeIntegration: false` and `contextIsolation: true` are enforced. The renderer has **zero direct access** to Node.js APIs. All privileged operations go through the secure `contextBridge` preload script.

## 4.4 Communication Flow

**[Figure 4.2 — Socket.io Event Flow Diagram]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT / DIAGRAM PLACEHOLDER ]                   ║
║                                                              ║
║       Insert Socket.io Event Flow Diagram here               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

Key Socket.io events:

| Event | Direction | Description |
|-------|-----------|-------------|
| `auth` | Student → Server | Student login with roll number & password |
| `auth_success` | Server → Student | Authentication confirmed, questions dispatched |
| `questions_load` | Server → Student | Exam questions pushed to student |
| `exam_started` | Server → All | Invigilator starts the exam globally |
| `exam_scheduled` | Server → All | Countdown timer dispatched |
| `submit_exam` | Student → Server | Student submits their final answers |
| `webcam_violation` | Student → Server | Proctoring alert forwarded to invigilator |
| `student_behavior` | Student → Server | Keystroke analytics stream |
| `screen_frame` | Student → Server | Compressed screenshot for live monitoring |
| `warning` | Server → Student | Invigilator sends a warning message |
| `force_lock` | Server → Student | Invigilator locks a student's screen |
| `emergency_kill` | Server → Student | Force-terminate the portal on a machine |

---

# CHAPTER 5: MODULES & IMPLEMENTATION

## 5.1 Module Overview

The project is divided into the following major modules:

```
AMU Examination Portal
├── Module 1: License & Setup System
├── Module 2: Student Authentication
├── Module 3: Exam Interface (Monaco Editor)
├── Module 4: Code Execution Engine
├── Module 5: AI Webcam Proctoring
├── Module 6: Anti-Cheat & Behaviour Analytics
├── Module 7: Workspace Management & Submission
├── Module 8: Admin Server & Dashboard
├── Module 9: Real-Time Communication (Socket.io)
└── Module 10: Database Layer (SQLite)
```

---

## 5.2 Module 1: License & Setup System

### 5.2.1 Purpose

The portal must only run on machines that have been explicitly authorised by the examination authority. An unlicensed installation displays a **setup screen** instead of the exam interface.

### 5.2.2 Hardware Locking Mechanism

The license is bound to the machine's **BIOS UUID** (queried via `Win32_ComputerSystemProduct` on Windows):

```javascript
// Simplified excerpt from main.js
function getMachineUUID() {
  const output = execSync(
    'powershell.exe -Command "Get-CimInstance -Class Win32_ComputerSystemProduct | ...'
  ).toString().trim();
  return output;
}

function createHardwareLock() {
  const uuid = getMachineUUID();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc', MASTER_SECRET.padEnd(32,'0'), iv
  );
  const encrypted = Buffer.concat([cipher.update(uuid), cipher.final()]);
  fs.writeFileSync(LICENSE_FILE, iv.toString('hex') + ':' + encrypted.toString('hex'));
}
```

The encrypted UUID is stored at `C:\ProgramData\AMUExamPortal\sys_lock.dat`. On every launch, the app decrypts this file and compares it to the current machine UUID. A mismatch (or missing file) redirects to the setup screen.

### 5.2.3 AAKO License Activation

The Admin generates a master license token (`AMU_MASTER_LICENSE_AUTHORIZED` AES-encrypted). The student machine admin imports this `.aako` file once to activate the portal on that machine.

**[Figure 5.1 — Setup / License Screen]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the setup/license import screen    ║
║      (shown on first run when license is not activated)      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 5.3 Module 2: Student Authentication

### 5.3.1 Login Flow

After license verification passes, the Student Portal displays the main exam screen with a login dialog. Students enter their **Roll Number** and **Exam Password** (assigned by the invigilator).

```
Student enters Roll + Password
         │
         ▼
   Socket.io `auth` event sent to Admin Server
         │
         ▼
   Server validates against database
         │
    ┌────┴────┐
   FAIL      PASS
    │          │
  Error      Bind IP + Issue Upload Token
  message    Push Questions to Student
             Start exam timer
```

### 5.3.2 Device Binding (Anti-Sharing)

When a student logs in for the first time, their IP address is **bound** to their roll number in the database. Any subsequent login attempt from a different IP is rejected with the message: *"Account is bound to another device. Contact Invigilator."*

This prevents one student from logging in on behalf of another student who is physically absent.

**[Figure 5.2 — Student Login Screen]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the student login dialog           ║
║      (Windows XP-themed with AMU logo and branding)          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 5.4 Module 3: Exam Interface (Monaco Editor)

### 5.4.1 Overview

The exam interface is designed to resemble a classic **Windows XP desktop** aesthetic, providing a familiar, distraction-free environment. It is built with vanilla HTML/CSS/JS and embeds the Monaco Editor library.

**[Figure 5.3 — Exam Interface (Code Editor View)]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the full exam interface:           ║
║      Left panel (question text), Right panel (Monaco         ║
║      code editor), Bottom (terminal), Top bar (timer)        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### 5.4.2 Key UI Components

| Component | Description |
|-----------|-------------|
| **Question Panel** | Displays title, difficulty, description, constraints, sample I/O |
| **Monaco Editor** | Full-featured code editor with syntax highlighting |
| **Language Selector** | Dropdown to switch between Python, C, C++ |
| **Terminal Output** | Scrollable pane showing stdout, stderr, and exit status |
| **Countdown Timer** | Synchronised with Admin Server; shows time remaining |
| **Webcam Widget** | Minimisable proctoring camera feed with status badge |
| **Submit Button** | Saves code buffer; final submit uploads workspace |

### 5.4.3 Multi-Question Navigation

Students can navigate between multiple questions. Each question maintains its own independent **code buffer** per language. Switching questions never loses unsaved code.

---

## 5.5 Module 4: Code Execution Engine

### 5.5.1 Sandboxed Execution

The code execution engine (`codeExecutor.js`) spawns child processes for running student code. It uses portable embedded runtimes to avoid dependency on system-installed Python or GCC.

```javascript
// Simplified execution flow
function startInteractiveProcess(code, language, onStdout, onStderr, onExit) {
  const { command, args, filename } = buildCommand(language, code);
  const child = spawn(command, args, { 
    cwd: workspacePath,
    windowsHide: true 
  });
  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);
  child.on('close', (code) => onExit(code, executionTime, timedOut));
}
```

### 5.5.2 Supported Languages

| Language | Compiler/Interpreter | Extension |
|----------|---------------------|-----------|
| Python 3 | Portable Python Embed 3.x | `.py` |
| C | MinGW GCC 16.x | `.c` |
| C++ | MinGW G++ 16.x | `.cpp` |

### 5.5.3 Timeout & Resource Control

- **Execution Timeout:** 10 seconds (kills process via `taskkill` on Windows).
- **Compilation Timeout:** Separate compile step with error reporting.
- **Workspace Isolation:** Each student gets a sandboxed folder identified by their roll number.

---

## 5.6 Module 5: AI Webcam Proctoring

This is one of the most technically sophisticated modules of the project.

### 5.6.1 Architecture

The proctoring engine is implemented in `camera-proctor.js` and runs entirely in the renderer process (Chromium). It uses:

1. **WebRTC** (`getUserMedia`) to access the student's webcam.
2. **MediaPipe FaceLandmarker** for 3D facial landmark estimation.
3. **Custom luminance-based fallback** for environments where the native Face Detector is unavailable.

### 5.6.2 Detection States

| State | Meaning | Action |
|-------|---------|--------|
| 🟢 `LOOKING_AT_SCREEN` | Face centred, looking forward | None |
| 🟡 `LOOKING_LEFT` | Head turned left | Violation timer starts |
| 🟡 `LOOKING_RIGHT` | Head turned right | Violation timer starts |
| 🔴 `FACE_ABSENT` | No face detected | Violation timer starts |
| 🔴 `CAMERA_COVERED` | Camera image is uniform (covered) | Immediate alert |
| ⚠️ `CAMERA_LOST` | Camera stream ended | Alert sent |

### 5.6.3 Violation Reporting

After a **continuous violation of approximately 2 seconds** (12 consecutive ticks at 160ms each), a `webcam_violation` event is emitted to the Admin Server with:
- Violation type (`LOOKING_BESIDE`, `FACE_ABSENT`, etc.)
- Direction (left/right)
- Duration in seconds
- Base64-encoded snapshot from the camera feed

```javascript
// Violation debounce logic (simplified)
const WARN_POSE_TICKS = 12;   // 12 × 160ms = ~2.0 seconds

if (consecutiveLeftCount >= WARN_POSE_TICKS) {
  reportViolation({
    type: 'LOOKING_BESIDE',
    direction: 'left',
    durationSeconds: 2,
    snapshot: captureSnapshot()
  });
  consecutiveLeftCount = 0;
}
```

### 5.6.4 Performance

- **Sampling Rate:** ~6 FPS (160ms interval)
- **Processing Resolution:** 80×80 pixel crop (for speed)
- **CPU Usage:** < 2% on typical i5 hardware
- **Network:** Snapshots sent only on violation events (not streamed continuously)

**[Figure 5.4 — Webcam Proctoring Widget]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the webcam proctoring widget       ║
║      showing: camera feed, face bounding box, green          ║
║      "Looking at Screen" badge                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 5.7 Module 6: Anti-Cheat & Behaviour Analytics

### 5.7.1 Keyboard Lockdown

The main process registers global shortcuts to swallow all system-level key combinations that could allow task-switching or closing the application:

**Blocked Shortcuts:**

| Category | Keys Blocked |
|----------|-------------|
| Task Switch | `Alt+Tab`, `Meta+Tab` |
| App Close | `Alt+F4`, `Ctrl+W` |
| Developer Tools | `Ctrl+Shift+I`, `Ctrl+Shift+J`, `F12` |
| Refresh | `Ctrl+R`, `F5` |
| System | `Escape`, `F1–F4`, `F6`, `F8–F11` |
| Windows Key | `Meta+D`, `Meta+Tab` |

A **master exit shortcut** (`Ctrl+Shift+Alt+O`) is known only to the invigilator, allowing emergency closure.

### 5.7.2 Focus Loss Detection

If the application window loses focus (even briefly), a `blur` event fires:
1. The violation counter increments.
2. The event is forwarded to the invigilator's dashboard.
3. The window immediately recaptures focus.

### 5.7.3 Keystroke Behaviour Analytics

The `behavior.js` module continuously analyses typing patterns and reports to the Admin Server every few seconds:

| Metric | Description |
|--------|-------------|
| **WPM** | Words per minute (typing speed) |
| **Idle Seconds** | Duration of no keyboard activity |
| **Backspace Ratio** | Proportion of keystrokes that are deletions |
| **Keystroke Variance** | Standard deviation of inter-key timing |
| **Suspicion Score** | Composite risk indicator |
| **Risk Level** | `NORMAL`, `MODERATE`, `HIGH` |

### 5.7.4 USB Device Detection

A companion `DetectUSB.exe` process monitors USB device insertion/removal during the exam. Any new USB device triggers a warning to the invigilator.

### 5.7.5 Screen Capture Stream

When enabled by the invigilator, the Admin Server sends a `start_screen_capture` command. The student portal begins capturing 1-FPS JPEG screenshots (compressed to ~30% quality for minimal bandwidth) and streams them to the server.

**[Figure 5.5 — Admin Screen Viewer]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the Admin screen viewer panel      ║
║      showing live thumbnail screenshots of student screens   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 5.8 Module 7: Workspace Management & Submission

### 5.8.1 Per-Student Workspace

Each student is assigned a dedicated **workspace directory** on the student machine's local storage, identified by their roll number. Code files are written here before execution. This allows the student to maintain multiple files if needed.

### 5.8.2 Final Submission

On "Final Submit":
1. All question code buffers are saved to the workspace.
2. The workspace directory is **compressed into a `.zip` file**.
3. The zip is uploaded via HTTP POST to `/api/admin/submit-workspace` on the Admin Server, authenticated with a **per-session upload token** (a 48-character hex random string issued at login).
4. The server extracts the zip into `Documents/AMU_Exam_Submissions/<roll_number>/`.
5. The student's database record is marked as `has_submitted = 1`.

### 5.8.3 Upload Token Security

```javascript
// Token issued at login (server-side)
uploadTokens.set(rollNumber, crypto.randomBytes(24).toString('hex'));

// Token verified at upload (server-side) using timing-safe comparison
const tokenOk = expected && typeof token === 'string' &&
  token.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
```

Using `timingSafeEqual` prevents timing-based attacks on the token comparison.

---

## 5.9 Module 8: Admin Server & Dashboard

### 5.9.1 Overview

The Admin Server is a combined **Electron desktop app + embedded Express.js server**. The invigilator sees a native Electron window showing server status, while the full dashboard is accessible from any browser on the network via `http://<invigilator-ip>:3000/admin`.

**[Figure 5.6 — Admin Dashboard Overview]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the Admin Dashboard main view      ║
║      showing: student count, exam status, navigation tabs    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### 5.9.2 Admin Features

| Feature | Description |
|---------|-------------|
| **Student Management** | Add, view, and delete students; set passwords |
| **CSV Bulk Import** | Upload a CSV file to register many students at once |
| **Question Management** | Add/delete coding questions with constraints and test cases |
| **Question Assignment** | Assign specific questions to specific students (differentiated exams) |
| **Exam Control** | Start now / schedule at a specific time / reset exam state |
| **Duration Setting** | Set exam time limit (minutes) |
| **Live Monitoring** | View all connected students with risk levels and status |
| **Screen Viewer** | Trigger and view live 1-FPS screenshots of any student |
| **Webcam Alerts** | View proctoring violations with snapshots |
| **Submission Viewer** | Browse and read submitted code files per student |
| **Code Runner** | Compile and run a student's submitted code server-side |
| **Lock/Unlock** | Lock a specific student's screen or account |
| **Force Submit** | Force-submit and close a specific student's portal |
| **System Logging** | Persistent log of all events stored in SQLite |
| **Database Backup** | Download the full SQLite database as a backup file |

**[Figure 5.7 — Live Student Monitoring Dashboard]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the Live Monitoring table:         ║
║      Columns: Roll No, Name, Status, Risk Level, WPM,        ║
║      Anomalies, System Number, Actions                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### 5.9.3 REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/students` | List all students |
| POST | `/api/admin/students` | Add a student |
| POST | `/api/admin/students/csv` | Bulk import via CSV |
| GET | `/api/admin/questions` | List all questions |
| POST | `/api/admin/questions` | Add a question |
| DELETE | `/api/admin/questions/:id` | Delete a question |
| GET | `/api/admin/settings` | Get exam settings |
| POST | `/api/admin/settings/state` | Start / schedule / reset exam |
| GET | `/api/admin/live-analysis` | Real-time student activity data |
| POST | `/api/admin/submit-workspace` | Receive student workspace zip |
| GET | `/api/admin/submissions/:roll` | List files for a student |
| POST | `/api/admin/submissions/run` | Run a submitted code file |
| GET | `/api/admin/logs` | Fetch event logs |
| GET | `/api/admin/database/download` | Download database backup |

---

# CHAPTER 6: DATABASE DESIGN

## 6.1 Overview

The Admin Server uses a **SQLite database** (`AMU_Exam_Database.sqlite`) managed via the `sql.js` pure-JavaScript library. This eliminates any native binary dependency and makes the application fully portable.

The database file is stored at:
```
%USERPROFILE%\Documents\AMU_Exam_Database.sqlite
```

## 6.2 Entity-Relationship Diagram

**[Figure 6.1 — Entity-Relationship Diagram]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ DIAGRAM PLACEHOLDER ]                                ║
║                                                              ║
║      Insert Entity-Relationship Diagram here                 ║
║                                                              ║
║      Entities: admins, students, questions,                  ║
║                submissions, logs                             ║
║                                                              ║
║      Relationships:                                          ║
║        students (1) ───────< submissions (N)                ║
║        questions (1) ───────< submissions (N)               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

## 6.3 Table Schemas

### Table: `admins`

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | TEXT | PRIMARY KEY | Admin identifier |
| `password` | TEXT | NOT NULL | Admin password |

### Table: `students`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `roll_number` | TEXT | PK | Student's unique roll number |
| `name` | TEXT | — | Full name |
| `password` | TEXT | — | Exam password |
| `bound_ip` | TEXT | NULL | IP address bound on first login |
| `is_locked` | INTEGER | 0 | 1 if account is locked by invigilator |
| `assigned_questions` | TEXT | '[]' | JSON array of question IDs |
| `has_submitted` | INTEGER | 0 | 1 if student has submitted the exam |

### Table: `questions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Unique question identifier |
| `title` | TEXT | Question title |
| `description` | TEXT | Full problem statement |
| `time_limit` | INTEGER | Per-question time limit (seconds) |
| `difficulty` | TEXT | Easy / Medium / Hard |
| `constraints` | TEXT | Problem constraints |
| `sampleInput` | TEXT | Example input |
| `sampleOutput` | TEXT | Expected example output |
| `explanation` | TEXT | Solution explanation |
| `testCases` | TEXT | JSON array of test cases |

### Table: `submissions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `roll_number` | TEXT | FK → students.roll_number |
| `question_id` | TEXT | FK → questions.id |
| `code` | TEXT | Submitted source code |
| `language` | TEXT | python / c / cpp |
| `status` | TEXT | Submission status |
| `timestamp` | INTEGER | Unix timestamp of submission |

### Table: `logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `timestamp` | INTEGER | Unix timestamp |
| `message` | TEXT | Log message |

## 6.4 Database Write Strategy

To prevent data loss from power interruptions, the database uses a **batched write strategy**:
- In-memory SQLite operations are fast and synchronous.
- A periodic flush saves the in-memory database to disk every 5 seconds.
- An explicit `flushDB()` call is made before critical operations (backup download, app quit).

---

# CHAPTER 7: SECURITY FEATURES

## 7.1 Security Overview

Security is the central design pillar of this project. The table below summarises all implemented security controls:

| Attack Vector | Mitigation |
|--------------|-----------|
| Switching to other apps | Kiosk mode + globalShortcut blocking |
| Opening DevTools | `devTools: false` in production + shortcut blocked |
| Navigating away | `will-navigate` event intercepted and cancelled |
| Opening new windows | `setWindowOpenHandler` returns `deny` |
| Injecting Node.js code | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` |
| USB device usage | `DetectUSB.exe` process monitors device insertion |
| Logging in on two machines | IP-based device binding per roll number |
| Impersonating uploads | Per-login cryptographic upload token |
| Timing attacks on tokens | `crypto.timingSafeEqual()` for token comparison |
| Zip path traversal | Server sanitises all filenames extracted from student zips |
| XSS via student data | `cleanText()` strips control characters and angle brackets |
| Unauthorised admin access | Session cookie + JWT for dashboard; `requireAdmin` middleware |

## 7.2 Renderer Process Isolation

Electron's security model is fully enforced:

```javascript
webPreferences: {
  nodeIntegration:  false,     // No Node.js in renderer
  contextIsolation: true,      // Isolated execution worlds
  sandbox:          true,      // Chromium sandbox enabled
  webviewTag:       false,     // No <webview> attack surface
  devTools: isDevMode,         // DevTools only in --dev mode
}
```

The `preload.js` script exposes only a tightly defined API to the renderer via `contextBridge.exposeInMainWorld()`, following the **principle of least privilege**.

## 7.3 License Security

The hardware lock uses **AES-256-CBC encryption** with a master secret key to encrypt the machine UUID. The encrypted blob is stored in `C:\ProgramData\AMUExamPortal\sys_lock.dat` — a system directory that requires administrator privileges to modify.

## 7.4 Input Sanitisation

All student-provided inputs that reach the server are sanitised:
- **Roll numbers** (used as folder names): `[^A-Za-z0-9_-]` replaced with `_`, max 64 chars.
- **File names**: `[^A-Za-z0-9_.-]` replaced with `_`, max 80 chars.
- **Display text**: Control characters and `<>` stripped; length capped.

---

# CHAPTER 8: TESTING & RESULTS

## 8.1 Testing Approach

The system was tested using the following strategies:

| Test Type | Scope |
|-----------|-------|
| Unit Testing | Individual functions (license check, sanitisation, DB operations) |
| Integration Testing | Socket.io event flow between Admin Server and Student Portal |
| System Testing | End-to-end exam simulation with multiple concurrent students |
| Security Testing | Attempting to break out of kiosk mode; USB insertion; shortcut testing |
| Proctoring Testing | AI head-pose detection accuracy at different head angles |

## 8.2 Functional Test Cases

| Test ID | Test Description | Expected Result | Status |
|---------|-----------------|----------------|--------|
| TC-01 | Student login with valid credentials | Exam screen loads, timer starts | Pass |
| TC-02 | Student login with wrong password | Error message shown | Pass |
| TC-03 | Student logs in from a second machine | "Bound to another device" error | Pass |
| TC-04 | Alt+Tab pressed during exam | Shortcut swallowed, focus kept | Pass |
| TC-05 | Python code execution (Hello World) | Correct output in terminal | Pass |
| TC-06 | C++ code with compilation error | Error message displayed | Pass |
| TC-07 | Invigilator starts exam from Admin | All connected clients receive `exam_started` | Pass |
| TC-08 | Student submits; workspace zip uploaded | Files appear in `AMU_Exam_Submissions` | Pass |
| TC-09 | AI proctoring: student looks left for 2s | Violation reported to Admin | Pass |
| TC-10 | Camera covered (uniform dark frame) | CAMERA_COVERED violation reported | Pass |
| TC-11 | USB device inserted during exam | USB alert appears on Admin dashboard | Pass |
| TC-12 | Invigilator sends warning message | Toast notification on student screen | Pass |
| TC-13 | Invigilator locks student screen | Student screen shows lock overlay | Pass |
| TC-14 | Network disconnection during exam | Portal waits, re-authenticates on reconnect | Pass |
| TC-15 | Admin downloads database backup | SQLite file downloaded correctly | Pass |

## 8.3 Performance Results

| Metric | Measured Value |
|--------|---------------|
| Portal startup time (after license verified) | ~2.5 seconds |
| Student login → Questions loaded | < 500 ms |
| Python code execution (simple script) | ~300 ms |
| C++ compile + run | ~1.2 seconds |
| Proctoring CPU usage | < 2% (i5, single core) |
| Screen capture bandwidth per student | ~15–25 KB/s |
| Workspace zip upload (average) | < 2 seconds (100 Mbps LAN) |
| Max simultaneous students tested | 30 clients |

## 8.4 Screenshots

**[Figure 8.1 — Student Portal Running (Full Interface)]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of a student actively writing code    ║
║      during the exam: Monaco editor with Python code,        ║
║      timer running, webcam widget showing green status       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**[Figure 8.2 — Admin Dashboard During Live Exam]**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       [ SCREENSHOT PLACEHOLDER ]                             ║
║                                                              ║
║      Insert screenshot of the Admin Dashboard during         ║
║      an active exam with 20+ students showing:               ║
║      connected count, risk levels, submission status         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

# CHAPTER 9: CONCLUSION & FUTURE WORK

## 9.1 Conclusion

The **AMU Online Examination Portal** successfully demonstrates that a secure, fully offline, AI-proctored computer-based examination platform can be built for university computer labs using modern open-source web technologies packaged as a native desktop application.

The system achieves its core objectives:
- **Kiosk lockdown** prevents all system access during the exam.
- **AI webcam proctoring** detects and reports malpractice in real time.
- **Integrated Monaco editor** with Python, C, and C++ gives students a professional coding environment.
- **Admin Server** provides invigilators with comprehensive real-time visibility and control.
- **Hardware-locked licensing** restricts deployment to authorised machines.
- **LAN-local communication** — no internet dependency whatsoever.

The portal has been tested with up to 30 simultaneous student connections with stable performance. The proctoring engine achieved reliable detection at less than 2% CPU overhead, making it practical for all standard lab computers.

## 9.2 Limitations

| Limitation | Description |
|-----------|-------------|
| Windows Only | The current build primarily targets Windows. Linux support is partial. |
| No Auto-Grading | Test cases are stored but automated evaluation is not yet implemented. |
| Plain-text Passwords | Student passwords in the DB are not hashed (suitable only for internal use). |
| No Question Randomisation | All students in the same group see the same question set. |
| Camera Required | AI proctoring requires a webcam; fallback gracefully degrades but reduces effectiveness. |

## 9.3 Future Work

| Enhancement | Description |
|------------|-------------|
| **Auto-Grading** | Automatically run test cases against submitted code and compute scores. |
| **Password Hashing** | Implement bcrypt hashing for student passwords. |
| **Question Randomisation** | Shuffle question order per student to reduce copying. |
| **Linux & macOS Support** | Full cross-platform deployment. |
| **Deeper AI Proctoring** | Integrate MediaPipe Holistic for body-pose analysis (leaning, phone use). |
| **Cloud Backup** | Optional encrypted backup of submissions to a cloud storage service. |
| **Multi-Subject Support** | Allow multiple exam papers to be loaded simultaneously. |
| **Result Generation** | Automated PDF report generation per student post-exam. |
| **Plagiarism Detection** | Moss/JPLAG integration for submission similarity analysis. |

---

## REFERENCES

1. Electron Documentation — Electron Security Best Practices. https://www.electronjs.org/docs/latest/tutorial/security

2. MediaPipe Documentation — Face Landmarker Task. https://developers.google.com/mediapipe/solutions/vision/face_landmarker

3. Socket.io Documentation — Server API. https://socket.io/docs/v4/server-api/

4. Monaco Editor — API Reference. https://microsoft.github.io/monaco-editor/

5. sql.js — SQLite compiled to WebAssembly. https://sql.js.org/

6. Express.js Documentation. https://expressjs.com/en/4x/api.html

7. Node.js Crypto Module. https://nodejs.org/api/crypto.html

8. NIST Special Publication 800-38A — AES-CBC. https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38a.pdf

9. Floratos, S. (2020). "AI-based Proctoring for Online Examinations." *International Journal of Educational Technology.*

10. GitHub — electron-builder Documentation. https://www.electron.build/

---

## APPENDIX A: KEY SOURCE CODE LISTING

### A.1 License Verification (main.js)

```javascript
function checkLicense() {
  if (!fs.existsSync(LICENSE_FILE)) return false;
  try {
    const encryptedData = fs.readFileSync(LICENSE_FILE, 'utf8');
    const parts = encryptedData.split(':');
    if (parts.length !== 2) return false;
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc', 
      Buffer.from(MASTER_SECRET.padEnd(32, '0')), 
      iv
    );
    let decrypted = Buffer.concat([
      decipher.update(encryptedText), 
      decipher.final()
    ]);
    return decrypted.toString() === getMachineUUID();
  } catch (err) {
    return false;
  }
}
```

### A.2 AI Proctoring Detection Logic (camera-proctor.js)

```javascript
// Real-time head-pose analysis running at ~6 FPS
const WARN_POSE_TICKS = 12;   // 12 × 160ms = ~2.0 seconds

function handleViolation(type, direction) {
  reportViolation({
    type: type,
    direction: direction,
    durationSeconds: Math.round(WARN_POSE_TICKS * 0.16),
    snapshot: captureSnapshot()
  });
}
```

### A.3 Database Schema (db.js)

```javascript
db.run(`
  CREATE TABLE IF NOT EXISTS students (
    roll_number TEXT PRIMARY KEY,
    name TEXT,
    password TEXT,
    bound_ip TEXT DEFAULT NULL,
    is_locked INTEGER DEFAULT 0,
    assigned_questions TEXT DEFAULT '[]',
    has_submitted INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT,
    question_id TEXT,
    code TEXT,
    language TEXT,
    status TEXT,
    timestamp INTEGER,
    FOREIGN KEY(roll_number) REFERENCES students(roll_number),
    FOREIGN KEY(question_id) REFERENCES questions(id)
  );
`);
```

### A.4 Secure Workspace Upload (server.js)

```javascript
app.post('/api/admin/submit-workspace', upload.single('workspace_zip'), 
  async (req, res) => {
    const rollNumber = req.body?.roll_number;
    const token = req.body?.upload_token;
    
    // Verify upload token using timing-safe comparison
    const expected = uploadTokens.get(String(rollNumber));
    const tokenOk = expected && typeof token === 'string' &&
      token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    
    if (!tokenOk) {
      return res.status(403).json({ success: false, error: 'Unauthorised' });
    }
    
    // Extract zip with path traversal protection
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries().filter(e => !e.isDirectory);
    for (const entry of entries) {
      const name = safeFileName(path.basename(entry.entryName));
      if (!name || entry.header.size > 2 * 1024 * 1024) continue;
      fs.writeFileSync(path.join(studentDir, name), entry.getData());
    }
});
```

---

*— End of Project Report —*

**Document Information**
- Project Title: AMU Online Examination Portal
- Author: Aarif Khan
- Institution: AMU Interdisciplinary Centre for Artificial Intelligence, Aligarh Muslim University, Aligarh
- Version: 1.0
- Date: November 2026
