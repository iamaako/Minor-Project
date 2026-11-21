"""
Generate Project_Report.docx from scratch using python-docx
AMU Online Examination Portal — Minor Project Report
"""

from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

doc = Document()

# ── Page margins ──────────────────────────────────────────────
for section in doc.sections:
    section.top_margin    = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin   = Cm(3.0)   # binding side
    section.right_margin  = Cm(2.0)

# ── Helper functions ──────────────────────────────────────────

def set_font(run, name='Times New Roman', size=12, bold=False, italic=False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.bold   = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor(*color)

def add_heading(text, level=1, center=False, size=None, color=None):
    """Add a styled heading paragraph."""
    p = doc.add_paragraph()
    p.style = doc.styles['Normal']
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    sizes = {1: 16, 2: 14, 3: 13, 4: 12}
    s = size or sizes.get(level, 12)
    set_font(run, size=s, bold=True, color=color)
    pf = p.paragraph_format
    pf.space_before = Pt(12 if level <= 2 else 6)
    pf.space_after  = Pt(6)
    return p

def add_para(text, bold=False, italic=False, center=False, size=12, indent=False, color=None):
    p = doc.add_paragraph()
    p.style = doc.styles['Normal']
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if indent:
        p.paragraph_format.left_indent = Cm(1)
    run = p.add_run(text)
    set_font(run, size=size, bold=bold, italic=italic, color=color)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    return p

def add_blank(n=1):
    for _ in range(n):
        doc.add_paragraph()

def add_page_break():
    doc.add_page_break()

def add_code_block(code_text):
    """Add a shaded code block."""
    p = doc.add_paragraph()
    p.style = doc.styles['Normal']
    p.paragraph_format.left_indent  = Cm(1)
    p.paragraph_format.right_indent = Cm(1)
    # Light grey shading
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), 'F0F0F0')
    pPr.append(shd)
    run = p.add_run(code_text)
    run.font.name = 'Courier New'
    run.font.size = Pt(9)
    p.paragraph_format.space_after = Pt(6)
    return p

def add_placeholder(label):
    """Add a dashed image placeholder box."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after  = Pt(6)
    border_line = '─' * 60
    run = p.add_run(f'┌{border_line}┐\n│  {label:<58}│\n│  (Insert screenshot / diagram here){" " * 22}│\n└{border_line}┘')
    run.font.name = 'Courier New'
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)
    return p

def add_table(headers, rows, col_widths=None):
    """Add a formatted table."""
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = 'Table Grid'
    # Header row
    hrow = t.rows[0]
    for i, h in enumerate(headers):
        cell = hrow.cells[i]
        cell.text = h
        for para in cell.paragraphs:
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in para.runs:
                run.bold = True
                run.font.size = Pt(10)
                run.font.name = 'Times New Roman'
        # Header background (blue-grey)
        tc_pr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'),   'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), 'D0D8E8')
        tc_pr.append(shd)
    # Data rows
    for ri, row_data in enumerate(rows):
        row = t.rows[ri + 1]
        for ci, cell_text in enumerate(row_data):
            cell = row.cells[ci]
            cell.text = str(cell_text)
            for para in cell.paragraphs:
                for run in para.runs:
                    run.font.size = Pt(10)
                    run.font.name = 'Times New Roman'
        # Alternate row shading
        if ri % 2 == 1:
            for ci in range(len(headers)):
                tc_pr = row.cells[ci]._tc.get_or_add_tcPr()
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'),   'clear')
                shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), 'F5F5F5')
                tc_pr.append(shd)
    if col_widths:
        for ci, w in enumerate(col_widths):
            for row in t.rows:
                row.cells[ci].width = Cm(w)
    doc.add_paragraph()
    return t


# ════════════════════════════════════════════════════════════════
#  TITLE PAGE
# ════════════════════════════════════════════════════════════════

add_blank(2)
add_para('ALIGARH MUSLIM UNIVERSITY', bold=True, center=True, size=18, color=(0x1a, 0x1a, 0x8a))
add_para('AMU Interdisciplinary Centre for Artificial Intelligence', bold=True, center=True, size=13)
add_blank()
add_para('─' * 70, center=True, size=10)
add_blank()
add_para('MINOR PROJECT REPORT', bold=True, center=True, size=16, color=(0x1a, 0x1a, 0x8a))
add_blank()

title_p = doc.add_paragraph()
title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title_p.add_run('AMU ONLINE EXAMINATION PORTAL')
run.font.name = 'Times New Roman'
run.font.size = Pt(22)
run.bold = True
run.font.color.rgb = RGBColor(0x0d, 0x47, 0xa1)

add_blank()
add_para('A Secure, AI-Proctored Computer-Based Examination System', italic=True, center=True, size=13)
add_blank(2)

add_para('Submitted in partial fulfilment of the requirements for the degree of', center=True, size=11)
add_para('Bachelor of Technology', bold=True, center=True, size=13)
add_para('in', center=True, size=11)
add_para('Computer Science & Engineering / Information Technology', bold=True, center=True, size=13)
add_blank(2)

add_para('Submitted By:', bold=True, center=True, size=12)
add_para('Aarif Khan', bold=True, center=True, size=14, color=(0x0d, 0x47, 0xa1))
add_blank()

add_para('Under the Guidance of:', bold=True, center=True, size=12)
add_para('[Supervisor Name]', bold=True, center=True, size=13)
add_para('Department of Computer Science', center=True, size=11)
add_para('Aligarh Muslim University, Aligarh', center=True, size=11)
add_blank(2)
add_para('Academic Year: 2026–27', bold=True, center=True, size=12)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CERTIFICATE
# ════════════════════════════════════════════════════════════════
add_heading('CERTIFICATE', level=1, center=True)
add_blank()
add_para(
    'This is to certify that the minor project entitled "AMU Online Examination Portal — '
    'A Secure, AI-Proctored Computer-Based Examination System" has been carried out by '
    'Aarif Khan under our supervision, in partial fulfilment of the requirements for the '
    'award of the degree of Bachelor of Technology from Aligarh Muslim University, Aligarh. '
    'The work is genuine and has not been submitted elsewhere for the award of any degree or diploma.',
    size=12
)
add_blank(3)
add_para('Supervisor:', bold=True, size=12)
add_para('[Supervisor Name]', size=12)
add_para('Department of Computer Science', size=12)
add_para('Aligarh Muslim University, Aligarh', size=12)
add_blank(2)
add_para('Date: November 2026', size=12)
add_para('Place: Aligarh', size=12)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  DECLARATION
# ════════════════════════════════════════════════════════════════
add_heading('DECLARATION', level=1, center=True)
add_blank()
add_para(
    'I hereby declare that the project entitled "AMU Online Examination Portal" submitted '
    'to Aligarh Muslim University is a record of original work done by me under the '
    'supervision of [Supervisor Name]. This project work has not been previously submitted '
    'for any other degree or diploma to any university or institution.',
    size=12
)
add_blank(3)
add_para('Aarif Khan', bold=True, size=12)
add_para('AMU Interdisciplinary Centre for Artificial Intelligence', size=12)
add_para('Date: November 2026', size=12)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  ACKNOWLEDGEMENT
# ════════════════════════════════════════════════════════════════
add_heading('ACKNOWLEDGEMENT', level=1, center=True)
add_blank()
add_para(
    'I extend my sincere gratitude to my project supervisor [Supervisor Name] for the '
    'invaluable guidance and support throughout this project. I am thankful to the '
    'Department of Computer Science, Aligarh Muslim University, for providing the resources '
    'and environment to carry out this work.',
    size=12
)
add_blank()
add_para(
    'I also thank my colleagues and friends who offered their feedback and assistance '
    'during the development and testing phases of this project.',
    size=12
)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  ABSTRACT
# ════════════════════════════════════════════════════════════════
add_heading('ABSTRACT', level=1, center=True)
add_blank()
add_para(
    'The AMU Online Examination Portal is a comprehensive, desktop-based, kiosk-locked '
    'examination platform designed specifically for the computer labs of Aligarh Muslim '
    'University. The system comprises two Electron-based desktop applications: an Admin '
    'Server (for invigilators and teachers) and a Student Portal (for exam candidates).',
    size=12
)
add_blank()
add_para(
    'The portal addresses critical shortcomings of traditional pen-and-paper and unproctored '
    'online exams. It enforces a secure, fullscreen kiosk mode, blocks all system shortcuts '
    'and task-switching, and employs a real-time AI-based webcam proctoring engine built on '
    'MediaPipe\'s facial landmark technology. The system supports multi-language code execution '
    '(Python, C, C++) via sandboxed child processes, real-time synchronisation over Socket.io, '
    'hardware-locked licensing, and automated workspace submission.',
    size=12
)
add_blank()
add_para(
    'The result is an end-to-end, offline-capable examination platform that significantly '
    'reduces malpractice and administrative overhead in computer-science practical examinations.',
    size=12
)
add_blank()
add_para('Keywords: Electron, Kiosk Mode, AI Proctoring, MediaPipe, Socket.io, '
         'Secure Examination, Node.js, SQLite, Code Execution.', italic=True, size=11)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  TABLE OF CONTENTS
# ════════════════════════════════════════════════════════════════
add_heading('TABLE OF CONTENTS', level=1, center=True)
add_blank()
toc_items = [
    ('Certificate', ''),
    ('Declaration', ''),
    ('Acknowledgement', ''),
    ('Abstract', ''),
    ('Table of Contents', ''),
    ('List of Figures', ''),
    ('List of Abbreviations', ''),
    ('Chapter 1 — Introduction', '1'),
    ('    1.1  Background', '1'),
    ('    1.2  Problem Statement', '2'),
    ('    1.3  Objectives', '2'),
    ('    1.4  Scope of the Project', '2'),
    ('    1.5  Report Organisation', '3'),
    ('Chapter 2 — Literature Review', '4'),
    ('    2.1  Existing Examination Systems', '4'),
    ('    2.2  Electron Framework', '4'),
    ('    2.3  MediaPipe for Facial Analysis', '5'),
    ('    2.4  Socket.io', '5'),
    ('    2.5  Monaco Editor', '5'),
    ('Chapter 3 — System Requirements', '6'),
    ('    3.1  Hardware Requirements', '6'),
    ('    3.2  Software Requirements', '7'),
    ('Chapter 4 — System Architecture & Design', '8'),
    ('    4.1  High-Level Architecture', '8'),
    ('    4.2  Two-Application Design', '9'),
    ('    4.3  Process Architecture (Electron)', '9'),
    ('    4.4  Communication Flow', '10'),
    ('Chapter 5 — Modules & Implementation', '11'),
    ('    5.1  Module Overview', '11'),
    ('    5.2  License & Setup System', '11'),
    ('    5.3  Student Authentication', '12'),
    ('    5.4  Exam Interface (Monaco Editor)', '13'),
    ('    5.5  Code Execution Engine', '14'),
    ('    5.6  AI Webcam Proctoring', '15'),
    ('    5.7  Anti-Cheat & Behaviour Analytics', '17'),
    ('    5.8  Workspace Management & Submission', '18'),
    ('    5.9  Admin Server & Dashboard', '19'),
    ('Chapter 6 — Database Design', '21'),
    ('    6.1  Overview', '21'),
    ('    6.2  Entity-Relationship Diagram', '21'),
    ('    6.3  Table Schemas', '22'),
    ('    6.4  Write Strategy', '23'),
    ('Chapter 7 — Security Features', '24'),
    ('    7.1  Security Overview', '24'),
    ('    7.2  Renderer Process Isolation', '24'),
    ('    7.3  License Security', '25'),
    ('    7.4  Input Sanitisation', '25'),
    ('Chapter 8 — Testing & Results', '26'),
    ('    8.1  Testing Approach', '26'),
    ('    8.2  Functional Test Cases', '26'),
    ('    8.3  Performance Results', '27'),
    ('Chapter 9 — Conclusion & Future Work', '28'),
    ('    9.1  Conclusion', '28'),
    ('    9.2  Limitations', '28'),
    ('    9.3  Future Work', '29'),
    ('References', '30'),
    ('Appendix A — Key Source Code Listing', '31'),
]
for name, pg in toc_items:
    p = doc.add_paragraph()
    p.style = doc.styles['Normal']
    run = p.add_run(name)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(11)
    if name.startswith('Chapter') or name in ('References', 'Appendix A — Key Source Code Listing'):
        run.bold = True
    # Dot leaders
    if pg:
        tab_stop = p.paragraph_format
    p.paragraph_format.space_after = Pt(2)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  LIST OF FIGURES
# ════════════════════════════════════════════════════════════════
add_heading('LIST OF FIGURES', level=1, center=True)
add_blank()
figures = [
    ('Fig. 4.1', 'High-Level System Architecture Diagram'),
    ('Fig. 5.1', 'Student Portal – Setup / License Screen'),
    ('Fig. 5.2', 'Student Portal – Login Screen'),
    ('Fig. 5.3', 'Student Portal – Exam Interface (Code Editor)'),
    ('Fig. 5.4', 'Student Portal – Webcam Proctoring Widget'),
    ('Fig. 5.5', 'Admin Server – Screen Viewer'),
    ('Fig. 5.6', 'Admin Server – Dashboard Overview'),
    ('Fig. 5.7', 'Admin Server – Live Student Monitoring'),
    ('Fig. 6.1', 'Database Entity-Relationship Diagram'),
    ('Fig. 8.1', 'Running Exam — Full Student Interface'),
    ('Fig. 8.2', 'Admin Dashboard During Live Exam'),
]
add_table(['Figure No.', 'Title'], figures, col_widths=[3, 11])
add_page_break()

# LIST OF ABBREVIATIONS
add_heading('LIST OF ABBREVIATIONS', level=1, center=True)
add_blank()
abbrevs = [
    ('AMU', 'Aligarh Muslim University'),
    ('AI',  'Artificial Intelligence'),
    ('API', 'Application Programming Interface'),
    ('CBT', 'Computer-Based Test'),
    ('CPU', 'Central Processing Unit'),
    ('CSS', 'Cascading Style Sheets'),
    ('FPS', 'Frames Per Second'),
    ('HTML','HyperText Markup Language'),
    ('IPC', 'Inter-Process Communication'),
    ('JS',  'JavaScript'),
    ('JSON','JavaScript Object Notation'),
    ('JWT', 'JSON Web Token'),
    ('LAN', 'Local Area Network'),
    ('OS',  'Operating System'),
    ('REST','Representational State Transfer'),
    ('SQL', 'Structured Query Language'),
    ('UI',  'User Interface'),
    ('URL', 'Uniform Resource Locator'),
    ('UUID','Universally Unique Identifier'),
]
add_table(['Abbreviation', 'Full Form'], abbrevs, col_widths=[4, 10])
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 1 — INTRODUCTION
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 1: INTRODUCTION', level=1)
add_heading('1.1  Background', level=2)
add_para(
    'Aligarh Muslim University (AMU) conducts numerous practical and theory examinations '
    'for its computer science students every academic year. Traditionally, these examinations '
    'were conducted using pen-and-paper methods, which are unsuitable for assessing programming '
    'skills that require actual code writing and execution. With the advent of Computer-Based '
    'Testing (CBT), several issues emerged, including:', size=12
)
for item in [
    'Students switching between browser tabs to access reference material.',
    'Use of external USB devices to copy pre-written code.',
    'Collaboration via chat apps or screen-sharing tools during exams.',
    'No real-time visibility for invigilators across multiple lab machines.',
    'Manual, error-prone paper collection and evaluation.',
]:
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(item)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)

add_para(
    'The AMU Online Examination Portal was designed to address all of these challenges '
    'within a university lab environment.', size=12
)

add_heading('1.2  Problem Statement', level=2)
add_para(
    'Existing online examination tools (Google Forms, Moodle quizzes, etc.) are not suitable '
    'for programming examinations because:', size=12
)
for i, item in enumerate([
    'They run inside a browser that can be minimised or switched away from.',
    'They do not support code compilation and execution.',
    'They offer no AI-based proctoring for head-pose or presence detection.',
    'They are dependent on a stable internet connection.',
    'They do not provide real-time monitoring of student activity to invigilators.',
], 1):
    p = doc.add_paragraph(style='List Number')
    run = p.add_run(item)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)

add_para(
    'There is a clear need for a dedicated, lockdown-capable desktop application that runs '
    'directly on lab machines, provides a fully integrated code editor, executes code securely, '
    'and streams live status to the invigilator\'s dashboard.', size=12
)

add_heading('1.3  Objectives', level=2)
objectives = [
    'Develop a secure kiosk-mode student portal that prevents access to any other application during the exam.',
    'Implement a real-time AI webcam proctoring engine to detect when a student looks away or is absent.',
    'Provide an integrated Monaco code editor supporting Python, C, and C++.',
    'Build an Admin Server that allows teachers to manage students, questions, and monitor live activity.',
    'Enable hardware-locked licensing to prevent unauthorised deployment of the portal.',
    'Support offline operation with a local SQLite database and portable runtime tools.',
    'Ensure automatic workspace upload upon exam submission for persistent record-keeping.',
]
for obj in objectives:
    p = doc.add_paragraph(style='List Number')
    run = p.add_run(obj)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)

add_heading('1.4  Scope of the Project', level=2)
add_para('The project covers:', size=12)
for item in [
    'Two desktop applications (Admin Server & Student Portal) for Windows environments.',
    'A local-area-network (LAN) based communication model — no internet required.',
    'Real-time exam management (start, schedule, pause, resume, force-submit).',
    'Code execution for Python 3, C, and C++ using portable embedded runtimes.',
    'AI-based proctoring using MediaPipe\'s Face Detector API.',
    'Student submission storage and teacher-side code evaluation.',
]:
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(item)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)
add_para('The project does not include cloud hosting, online judge auto-grading, or mobile platforms.', italic=True, size=12)

add_heading('1.5  Report Organisation', level=2)
add_para(
    'The rest of this report is organised as follows: Chapter 2 reviews related work. '
    'Chapter 3 discusses system requirements. Chapter 4 covers system architecture. '
    'Chapter 5 describes each module and its implementation. Chapter 6 covers the '
    'database design. Chapter 7 discusses security features. Chapter 8 presents testing '
    'and results. Chapter 9 concludes with future work.', size=12
)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 2 — LITERATURE REVIEW
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 2: LITERATURE REVIEW', level=1)
add_heading('2.1  Existing Examination Systems', level=2)
add_para('Several commercial and open-source examination systems have been studied:', size=12)
add_table(
    ['System', 'Type', 'Proctoring', 'Code Execution', 'Offline'],
    [
        ('HackerRank', 'Web', 'Basic', 'Yes', 'No'),
        ('Moodle', 'Web', 'Plugin-based', 'No', 'No'),
        ('Talview', 'Web', 'AI', 'No', 'No'),
        ('Safe Exam Browser', 'Desktop', 'Lockdown Only', 'No', 'Partial'),
        ('ExamSoft', 'Desktop', 'AI + Lockdown', 'No', 'Partial'),
    ],
    col_widths=[3.5, 2.5, 3, 3, 2]
)
add_para(
    'None of the above systems combines kiosk lockdown, AI proctoring, integrated code '
    'execution, and a fully local LAN-based deployment, which is exactly the gap this project fills.', size=12
)

add_heading('2.2  Electron Framework for Desktop Applications', level=2)
add_para(
    'Electron (developed by GitHub) allows building cross-platform desktop applications '
    'using web technologies (HTML, CSS, JavaScript). It wraps a Chromium rendering engine '
    'and a Node.js runtime. Its IPC bridge between the main process and renderer process '
    'makes it suitable for security-sensitive applications where the renderer should not '
    'have direct Node.js access. Electron\'s kiosk mode and globalShortcut API allow complete '
    'lockdown of the system UI, something impossible in a web browser alone.', size=12
)

add_heading('2.3  MediaPipe for Real-Time Facial Analysis', level=2)
add_para(
    'MediaPipe (Google) is an open-source framework for machine learning pipelines. Its '
    'FaceDetector and FaceLandmarker tasks can detect facial bounding boxes and 3D facial '
    'landmark coordinates at 30+ FPS on consumer hardware. In this project, the camera-proctor '
    'module uses MediaPipe\'s FaceLandmarker task (via @mediapipe/tasks-vision) to detect head '
    'pose, face presence/absence, and camera obstruction.', size=12
)

add_heading('2.4  Socket.io for Real-Time Communication', level=2)
add_para(
    'Socket.io is a JavaScript library that enables real-time, event-based communication between '
    'servers and clients over WebSockets (with HTTP long-polling fallback). Its automatic '
    'reconnection logic is critical for maintaining exam sessions during transient LAN connectivity '
    'issues.', size=12
)

add_heading('2.5  Monaco Editor', level=2)
add_para(
    'Monaco Editor is the same code editor that powers Visual Studio Code. It provides syntax '
    'highlighting, IntelliSense, and line numbering for all major programming languages. Embedding '
    'it in the Student Portal offers students a familiar, comfortable coding environment.', size=12
)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 3 — SYSTEM REQUIREMENTS
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 3: SYSTEM REQUIREMENTS', level=1)
add_heading('3.1  Hardware Requirements', level=2)
add_heading('Admin Server Machine (Invigilator\'s PC)', level=3)
add_table(
    ['Component', 'Minimum', 'Recommended'],
    [
        ('Processor', 'Intel Core i3', 'Intel Core i5 / Ryzen 5'),
        ('RAM', '4 GB', '8 GB'),
        ('Storage', '10 GB free', '50 GB free'),
        ('Network', '100 Mbps LAN', 'Gigabit LAN'),
        ('OS', 'Windows 10', 'Windows 10/11'),
    ]
)
add_heading('Student Lab Machine', level=3)
add_table(
    ['Component', 'Minimum', 'Recommended'],
    [
        ('Processor', 'Intel Core i3', 'Intel Core i5'),
        ('RAM', '4 GB', '8 GB'),
        ('Storage', '5 GB free', '10 GB free'),
        ('Camera', '480p Webcam', '720p HD Webcam'),
        ('Network', '100 Mbps LAN', 'Gigabit LAN'),
        ('OS', 'Windows 10', 'Windows 10/11'),
    ]
)

add_heading('3.2  Software Requirements', level=2)
add_heading('Development Environment', level=3)
add_table(
    ['Software', 'Version', 'Purpose'],
    [
        ('Node.js', 'v20+', 'JavaScript runtime'),
        ('Electron', 'v35.x', 'Desktop app framework'),
        ('Bun', 'v1.x', 'Package manager (Admin Server)'),
        ('npm', 'v9+', 'Package manager (Student Portal)'),
        ('electron-builder', 'v24.x', 'Packaging & installer generation'),
    ]
)
add_heading('Runtime Dependencies — Student Portal', level=3)
add_table(
    ['Package', 'Version', 'Purpose'],
    [
        ('socket.io-client', '4.8.0', 'Server communication'),
        ('@mediapipe/tasks-vision', '1.2.3', 'AI face detection'),
        ('monaco-editor', '0.52.2', 'Code editor'),
        ('archiver / adm-zip', '—', 'Workspace compression'),
        ('uuid', '11.1.0', 'Unique token generation'),
    ]
)
add_heading('Runtime Dependencies — Admin Server', level=3)
add_table(
    ['Package', 'Version', 'Purpose'],
    [
        ('express', '4.21.2', 'HTTP server & REST API'),
        ('socket.io', '4.8.1', 'Real-time server'),
        ('sql.js', '1.14.1', 'SQLite in pure JavaScript'),
        ('jsonwebtoken', '9.0.3', 'Admin authentication tokens'),
        ('multer', '2.2.0', 'File upload handling'),
        ('csv-parse', '7.0.0', 'Bulk student CSV import'),
    ]
)
add_heading('Portable Tools (Bundled with Installer)', level=3)
add_table(
    ['Tool', 'Purpose'],
    [
        ('Python 3 Embedded', 'Python code execution (no system Python needed)'),
        ('MinGW-w64 (GCC/G++)', 'C and C++ compilation & execution'),
    ]
)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 4 — ARCHITECTURE
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 4: SYSTEM ARCHITECTURE & DESIGN', level=1)
add_heading('4.1  High-Level Architecture', level=2)
add_para(
    'The system follows a Client-Server architecture operating over a local area network. '
    'The Admin Server acts as the single point of authority. All student portals connect to it '
    'via Socket.io over the LAN. No internet connection is required at any point during the exam.',
    size=12
)
add_blank()
add_placeholder('Fig. 4.1 — System Architecture Diagram')
add_blank()

add_heading('4.2  Two-Application Design', level=2)
add_heading('4.2.1  AMU Admin Server', level=3)
add_para(
    'A standalone Electron desktop application that embeds an Express.js + Socket.io server '
    'listening on port 3000. It provides a web-based Admin Dashboard accessible at '
    'http://<ip>:3000/admin, stores all data in a SQLite database, and receives live data '
    'from all connected student clients.', size=12
)
add_heading('4.2.2  AMU Student Portal', level=3)
add_para(
    'A standalone Electron desktop application that runs in fullscreen kiosk mode on each '
    'student machine. It connects to the Admin Server via Socket.io using the invigilator\'s '
    'IP address, presents the exam interface after hardware license verification and student '
    'authentication, and executes code using bundled Python and GCC runtimes.', size=12
)

add_heading('4.3  Process Architecture (Electron)', level=2)
add_para(
    'Both applications follow Electron\'s main process / renderer process separation. '
    'The main process handles window creation, keyboard lockdown, Socket.io communication, '
    'code execution (child processes), and file system access. The renderer process runs '
    'in a sandboxed Chromium environment with zero direct Node.js access — all privileged '
    'operations go through a secure contextBridge preload script.', size=12
)

add_heading('4.4  Communication Flow', level=2)
add_para('Key Socket.io events exchanged between the Student Portal and Admin Server:', size=12)
add_table(
    ['Event', 'Direction', 'Description'],
    [
        ('auth', 'Student → Server', 'Student login with roll number & password'),
        ('auth_success', 'Server → Student', 'Authentication confirmed, questions dispatched'),
        ('questions_load', 'Server → Student', 'Exam questions pushed to student'),
        ('exam_started', 'Server → All', 'Invigilator starts the exam globally'),
        ('exam_scheduled', 'Server → All', 'Countdown timer dispatched'),
        ('submit_exam', 'Student → Server', 'Student submits their final answers'),
        ('webcam_violation', 'Student → Server', 'Proctoring alert forwarded to invigilator'),
        ('student_behavior', 'Student → Server', 'Keystroke analytics stream'),
        ('screen_frame', 'Student → Server', 'Compressed screenshot for live monitoring'),
        ('warning', 'Server → Student', 'Invigilator sends a warning message'),
        ('force_lock', 'Server → Student', 'Invigilator locks a student\'s screen'),
        ('emergency_kill', 'Server → Student', 'Force-terminate the portal on a machine'),
    ],
    col_widths=[4, 4, 7]
)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 5 — MODULES
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 5: MODULES & IMPLEMENTATION', level=1)

add_heading('5.1  Module Overview', level=2)
add_para('The project is divided into the following major modules:', size=12)
modules = [
    'Module 1: License & Setup System',
    'Module 2: Student Authentication',
    'Module 3: Exam Interface (Monaco Editor)',
    'Module 4: Code Execution Engine',
    'Module 5: AI Webcam Proctoring',
    'Module 6: Anti-Cheat & Behaviour Analytics',
    'Module 7: Workspace Management & Submission',
    'Module 8: Admin Server & Dashboard',
]
for m in modules:
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(m)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)

add_heading('5.2  Module 1: License & Setup System', level=2)
add_para(
    'The portal must only run on machines that have been explicitly authorised by the '
    'examination authority. The license is bound to the machine\'s BIOS UUID queried via '
    'Win32_ComputerSystemProduct on Windows. The UUID is AES-256-CBC encrypted using a master '
    'secret key and stored at C:\\ProgramData\\AMUExamPortal\\sys_lock.dat. On every launch, '
    'the app decrypts this file and compares it to the current machine UUID. A mismatch redirects '
    'to the setup screen. The Admin generates a master license token; importing this .aako file '
    'once activates the portal on that machine.', size=12
)
add_blank()
add_placeholder('Fig. 5.1 — Setup / License Screen')
add_blank()

add_heading('5.3  Module 2: Student Authentication', level=2)
add_para(
    'After license verification, students enter their Roll Number and Exam Password via a '
    'login dialog. The credentials are sent over Socket.io to the Admin Server for validation '
    'against the SQLite database. On first login, the student\'s IP address is permanently bound '
    'to their roll number (device binding), preventing login from multiple machines. Any subsequent '
    'login from a different IP is rejected.', size=12
)
add_blank()
add_placeholder('Fig. 5.2 — Student Login Screen')
add_blank()

add_heading('5.4  Module 3: Exam Interface (Monaco Editor)', level=2)
add_para(
    'The exam interface uses a Windows XP-themed aesthetic with a split layout: the left panel '
    'shows the question (title, difficulty, description, constraints, sample I/O), and the right '
    'panel contains the Monaco code editor. A terminal pane at the bottom shows program output. '
    'A synchronised countdown timer, a minimisable webcam widget, and a submit button complete '
    'the interface. Each question maintains its own independent code buffer per language.', size=12
)
add_blank()
add_placeholder('Fig. 5.3 — Exam Interface (Code Editor View)')
add_blank()

add_heading('5.5  Module 4: Code Execution Engine', level=2)
add_heading('Supported Languages', level=3)
add_table(
    ['Language', 'Compiler/Interpreter', 'Extension'],
    [
        ('Python 3', 'Portable Python Embed 3.x', '.py'),
        ('C', 'MinGW GCC 16.x', '.c'),
        ('C++', 'MinGW G++ 16.x', '.cpp'),
    ]
)
add_para(
    'The code execution engine spawns child processes using portable embedded runtimes, '
    'avoiding any dependency on system-installed tools. Each execution is killed after a '
    '10-second timeout using taskkill on Windows. Each student has an isolated workspace directory.', size=12
)
add_blank()
add_code_block(
    "function startInteractiveProcess(code, language, onStdout, onStderr, onExit) {\n"
    "  const { command, args } = buildCommand(language, code);\n"
    "  const child = spawn(command, args, { cwd: workspacePath, windowsHide: true });\n"
    "  child.stdout.on('data', onStdout);\n"
    "  child.stderr.on('data', onStderr);\n"
    "  child.on('close', (code) => onExit(code, executionTime, timedOut));\n"
    "}"
)

add_heading('5.6  Module 5: AI Webcam Proctoring', level=2)
add_para(
    'The proctoring engine runs in the renderer process and uses WebRTC getUserMedia to access '
    'the webcam, MediaPipe FaceLandmarker for 3D facial landmark estimation, and a custom '
    'luminance-based fallback for environments where the native detector is unavailable. '
    'It samples at approximately 6 FPS (160ms interval) on an 80×80 pixel crop, consuming '
    'less than 2% CPU. After 12 consecutive violation ticks (~2 seconds), a webcam_violation '
    'event is emitted to the Admin Server with violation type, direction, duration, and a '
    'base64 snapshot.', size=12
)
add_blank()
add_table(
    ['State', 'Meaning', 'Action'],
    [
        ('LOOKING_AT_SCREEN', 'Face centred, looking forward', 'None'),
        ('LOOKING_LEFT', 'Head turned left', 'Violation timer starts'),
        ('LOOKING_RIGHT', 'Head turned right', 'Violation timer starts'),
        ('FACE_ABSENT', 'No face detected', 'Violation timer starts'),
        ('CAMERA_COVERED', 'Camera image is uniform (covered)', 'Immediate alert'),
        ('CAMERA_LOST', 'Camera stream ended', 'Alert sent'),
    ],
    col_widths=[4, 5, 5]
)
add_blank()
add_placeholder('Fig. 5.4 — Webcam Proctoring Widget')
add_blank()

add_heading('5.7  Module 6: Anti-Cheat & Behaviour Analytics', level=2)
add_heading('Keyboard Lockdown', level=3)
add_para('The following shortcuts are blocked globally during the exam:', size=12)
add_table(
    ['Category', 'Keys Blocked'],
    [
        ('Task Switch', 'Alt+Tab, Meta+Tab'),
        ('App Close', 'Alt+F4, Ctrl+W'),
        ('Developer Tools', 'Ctrl+Shift+I, Ctrl+Shift+J, F12'),
        ('Refresh', 'Ctrl+R, F5'),
        ('System', 'Escape, F1–F4, F6, F8–F11'),
        ('Windows Key', 'Meta+D, Meta+Tab'),
    ]
)
add_heading('Behaviour Analytics', level=3)
add_para('The behavior.js module reports typing patterns to the Admin Server:', size=12)
add_table(
    ['Metric', 'Description'],
    [
        ('WPM', 'Words per minute (typing speed)'),
        ('Idle Seconds', 'Duration of no keyboard activity'),
        ('Backspace Ratio', 'Proportion of keystrokes that are deletions'),
        ('Keystroke Variance', 'Standard deviation of inter-key timing'),
        ('Suspicion Score', 'Composite risk indicator (0–100)'),
        ('Risk Level', 'NORMAL / MODERATE / HIGH'),
    ]
)
add_blank()
add_placeholder('Fig. 5.5 — Admin Screen Viewer (Live Screenshots)')
add_blank()

add_heading('5.8  Module 7: Workspace Management & Submission', level=2)
add_para(
    'Each student has a sandboxed workspace directory on the local machine. On Final Submit, '
    'all question code buffers are saved to this workspace, compressed into a zip file, and '
    'uploaded via authenticated HTTP POST to the Admin Server. The server verifies the '
    'per-login upload token using crypto.timingSafeEqual (preventing timing attacks) before '
    'extracting the zip with path-traversal protection. The student\'s DB record is then '
    'marked as submitted.', size=12
)

add_heading('5.9  Module 8: Admin Server & Dashboard', level=2)
add_blank()
add_placeholder('Fig. 5.6 — Admin Dashboard Overview')
add_blank()
add_para('The Admin Server provides the following features:', size=12)
add_table(
    ['Feature', 'Description'],
    [
        ('Student Management', 'Add, view, delete students; set passwords'),
        ('CSV Bulk Import', 'Upload a CSV file to register many students at once'),
        ('Question Management', 'Add/delete coding questions with constraints and test cases'),
        ('Question Assignment', 'Assign specific questions to specific students'),
        ('Exam Control', 'Start now / schedule at a specific time / reset exam state'),
        ('Duration Setting', 'Set exam time limit (minutes)'),
        ('Live Monitoring', 'View all connected students with risk levels and status'),
        ('Screen Viewer', 'Trigger and view live 1-FPS screenshots of any student'),
        ('Webcam Alerts', 'View proctoring violations with snapshot images'),
        ('Submission Viewer', 'Browse and read submitted code files per student'),
        ('Code Runner', 'Compile and run a student\'s submitted code server-side'),
        ('Lock/Unlock', 'Lock a specific student\'s screen or account'),
        ('Force Submit', 'Force-submit and close a specific student\'s portal'),
        ('System Logging', 'Persistent event log stored in SQLite'),
        ('Database Backup', 'Download the full SQLite database as a backup file'),
    ],
    col_widths=[5, 10]
)
add_blank()
add_placeholder('Fig. 5.7 — Live Student Monitoring Dashboard')
add_blank()
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 6 — DATABASE
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 6: DATABASE DESIGN', level=1)
add_heading('6.1  Overview', level=2)
add_para(
    'The Admin Server uses a SQLite database (AMU_Exam_Database.sqlite) managed via the sql.js '
    'pure-JavaScript library. This eliminates any native binary dependency and makes the application '
    'fully portable. The database is stored in the user\'s Documents folder. In-memory operations '
    'are fast and synchronous; a periodic flush saves to disk every 5 seconds.', size=12
)

add_heading('6.2  Entity-Relationship Diagram', level=2)
add_blank()
add_placeholder('Fig. 6.1 — Entity-Relationship Diagram\n'
                '│  students (1) ────< submissions (N)\n'
                '│  questions (1) ───< submissions (N)')
add_blank()

add_heading('6.3  Table Schemas', level=2)
add_heading('Table: students', level=3)
add_table(
    ['Column', 'Type', 'Default', 'Description'],
    [
        ('roll_number', 'TEXT', 'PK', 'Student\'s unique roll number'),
        ('name', 'TEXT', '—', 'Full name'),
        ('password', 'TEXT', '—', 'Exam password'),
        ('bound_ip', 'TEXT', 'NULL', 'IP address bound on first login'),
        ('is_locked', 'INTEGER', '0', '1 if account is locked by invigilator'),
        ('assigned_questions', 'TEXT', '[]', 'JSON array of question IDs'),
        ('has_submitted', 'INTEGER', '0', '1 if student has submitted the exam'),
    ]
)
add_heading('Table: questions', level=3)
add_table(
    ['Column', 'Type', 'Description'],
    [
        ('id', 'TEXT', 'Unique question identifier'),
        ('title', 'TEXT', 'Question title'),
        ('description', 'TEXT', 'Full problem statement'),
        ('time_limit', 'INTEGER', 'Per-question time limit (seconds)'),
        ('difficulty', 'TEXT', 'Easy / Medium / Hard'),
        ('constraints', 'TEXT', 'Problem constraints'),
        ('sampleInput', 'TEXT', 'Example input'),
        ('sampleOutput', 'TEXT', 'Expected example output'),
        ('testCases', 'TEXT', 'JSON array of test cases'),
    ]
)
add_heading('Table: submissions', level=3)
add_table(
    ['Column', 'Type', 'Description'],
    [
        ('id', 'INTEGER', 'Auto-increment primary key'),
        ('roll_number', 'TEXT', 'FK → students.roll_number'),
        ('question_id', 'TEXT', 'FK → questions.id'),
        ('code', 'TEXT', 'Submitted source code'),
        ('language', 'TEXT', 'python / c / cpp'),
        ('status', 'TEXT', 'Submission status'),
        ('timestamp', 'INTEGER', 'Unix timestamp of submission'),
    ]
)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 7 — SECURITY
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 7: SECURITY FEATURES', level=1)
add_heading('7.1  Security Overview', level=2)
add_table(
    ['Attack Vector', 'Mitigation'],
    [
        ('Switching to other apps', 'Kiosk mode + globalShortcut blocking'),
        ('Opening DevTools', 'devTools: false in production + shortcut blocked'),
        ('Navigating away', 'will-navigate event intercepted and cancelled'),
        ('Opening new windows', 'setWindowOpenHandler returns deny'),
        ('Injecting Node.js code', 'nodeIntegration: false, contextIsolation: true, sandbox: true'),
        ('USB device usage', 'DetectUSB.exe process monitors device insertion'),
        ('Logging in on two machines', 'IP-based device binding per roll number'),
        ('Impersonating uploads', 'Per-login cryptographic upload token (48-char hex)'),
        ('Timing attacks on tokens', 'crypto.timingSafeEqual() for token comparison'),
        ('Zip path traversal', 'Server sanitises all filenames extracted from student zips'),
        ('XSS via student data', 'cleanText() strips control characters and angle brackets'),
        ('Unauthorised admin access', 'Session cookie + JWT; requireAdmin middleware'),
    ],
    col_widths=[7, 8]
)

add_heading('7.2  Renderer Process Isolation', level=2)
add_para(
    'Electron\'s security model is fully enforced. The renderer process has zero direct access '
    'to Node.js APIs. All privileged operations go through the secure contextBridge preload '
    'script, following the principle of least privilege.', size=12
)
add_blank()
add_code_block(
    "webPreferences: {\n"
    "  nodeIntegration:  false,     // No Node.js in renderer\n"
    "  contextIsolation: true,      // Isolated execution worlds\n"
    "  sandbox:          true,      // Chromium sandbox enabled\n"
    "  webviewTag:       false,     // No <webview> attack surface\n"
    "  devTools: isDevMode,         // DevTools only in --dev mode\n"
    "}"
)

add_heading('7.3  License Security', level=2)
add_para(
    'The hardware lock uses AES-256-CBC encryption with a master secret key to encrypt the '
    'machine UUID. The encrypted blob is stored at C:\\ProgramData\\AMUExamPortal\\sys_lock.dat '
    '— a system directory requiring administrator privileges to modify.', size=12
)

add_heading('7.4  Input Sanitisation', level=2)
add_para('All student-provided inputs that reach the server are sanitised:', size=12)
for item in [
    'Roll numbers (used as folder names): only [A-Za-z0-9_-] allowed, max 64 characters.',
    'File names: only [A-Za-z0-9_.-] allowed, max 80 characters.',
    'Display text: control characters and <> stripped; length capped.',
]:
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(item)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 8 — TESTING
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 8: TESTING & RESULTS', level=1)
add_heading('8.1  Testing Approach', level=2)
add_table(
    ['Test Type', 'Scope'],
    [
        ('Unit Testing', 'Individual functions (license check, sanitisation, DB operations)'),
        ('Integration Testing', 'Socket.io event flow between Admin Server and Student Portal'),
        ('System Testing', 'End-to-end exam simulation with multiple concurrent students'),
        ('Security Testing', 'Attempting to break out of kiosk mode; USB insertion; shortcut testing'),
        ('Proctoring Testing', 'AI head-pose detection accuracy at different head angles'),
    ]
)

add_heading('8.2  Functional Test Cases', level=2)
add_table(
    ['Test ID', 'Test Description', 'Expected Result', 'Status'],
    [
        ('TC-01', 'Student login with valid credentials', 'Exam screen loads, timer starts', 'PASS'),
        ('TC-02', 'Student login with wrong password', 'Error message shown', 'PASS'),
        ('TC-03', 'Student logs in from a second machine', '"Bound to another device" error', 'PASS'),
        ('TC-04', 'Alt+Tab pressed during exam', 'Shortcut swallowed, focus kept', 'PASS'),
        ('TC-05', 'Python code execution (Hello World)', 'Correct output in terminal', 'PASS'),
        ('TC-06', 'C++ code with compilation error', 'Error message displayed', 'PASS'),
        ('TC-07', 'Invigilator starts exam from Admin', 'All clients receive exam_started event', 'PASS'),
        ('TC-08', 'Student submits; workspace zip uploaded', 'Files appear in AMU_Exam_Submissions', 'PASS'),
        ('TC-09', 'AI proctoring: student looks left for 2s', 'Violation reported to Admin', 'PASS'),
        ('TC-10', 'Camera covered (uniform dark frame)', 'CAMERA_COVERED violation reported', 'PASS'),
        ('TC-11', 'USB device inserted during exam', 'USB alert appears on Admin dashboard', 'PASS'),
        ('TC-12', 'Invigilator sends warning message', 'Toast notification on student screen', 'PASS'),
        ('TC-13', 'Invigilator locks student screen', 'Student screen shows lock overlay', 'PASS'),
        ('TC-14', 'Network disconnection during exam', 'Portal waits, re-authenticates on reconnect', 'PASS'),
        ('TC-15', 'Admin downloads database backup', 'SQLite file downloaded correctly', 'PASS'),
    ],
    col_widths=[2, 5, 6, 2]
)

add_heading('8.3  Performance Results', level=2)
add_table(
    ['Metric', 'Measured Value'],
    [
        ('Portal startup time (after license verified)', '~2.5 seconds'),
        ('Student login to Questions loaded', '< 500 ms'),
        ('Python code execution (simple script)', '~300 ms'),
        ('C++ compile + run', '~1.2 seconds'),
        ('Proctoring CPU usage', '< 2% (Intel Core i5, single core)'),
        ('Screen capture bandwidth per student', '~15–25 KB/s'),
        ('Workspace zip upload (average)', '< 2 seconds (100 Mbps LAN)'),
        ('Max simultaneous students tested', '30 clients'),
    ]
)
add_blank()
add_placeholder('Fig. 8.1 — Student Portal Running (Full Interface During Exam)')
add_blank()
add_placeholder('Fig. 8.2 — Admin Dashboard During Live Exam (20+ Students)')
add_blank()
add_page_break()

# ════════════════════════════════════════════════════════════════
#  CHAPTER 9 — CONCLUSION
# ════════════════════════════════════════════════════════════════
add_heading('CHAPTER 9: CONCLUSION & FUTURE WORK', level=1)
add_heading('9.1  Conclusion', level=2)
add_para(
    'The AMU Online Examination Portal successfully demonstrates that a secure, fully offline, '
    'AI-proctored computer-based examination platform can be built for university computer labs '
    'using modern open-source web technologies packaged as a native desktop application.', size=12
)
add_para('The system achieves its core objectives:', size=12)
for item in [
    'Kiosk lockdown prevents all system access during the exam.',
    'AI webcam proctoring detects and reports malpractice in real time.',
    'Integrated Monaco editor with Python, C, and C++ provides a professional coding environment.',
    'Admin Server provides invigilators with comprehensive real-time visibility and control.',
    'Hardware-locked licensing restricts deployment to authorised machines.',
    'LAN-local communication eliminates internet dependency entirely.',
]:
    p = doc.add_paragraph(style='List Bullet')
    run = p.add_run(item)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(12)
add_para(
    'The portal has been tested with up to 30 simultaneous student connections with stable '
    'performance. The proctoring engine achieved reliable detection at less than 2% CPU overhead.', size=12
)

add_heading('9.2  Limitations', level=2)
add_table(
    ['Limitation', 'Description'],
    [
        ('Windows Only', 'The current build primarily targets Windows. Linux support is partial.'),
        ('No Auto-Grading', 'Test cases are stored but automated evaluation is not yet implemented.'),
        ('Plain-text Passwords', 'Student passwords in the DB are not hashed (suitable for internal use only).'),
        ('No Question Randomisation', 'All students in the same group see the same question set.'),
        ('Camera Required', 'AI proctoring requires a webcam; fallback degrades effectiveness.'),
    ]
)

add_heading('9.3  Future Work', level=2)
add_table(
    ['Enhancement', 'Description'],
    [
        ('Auto-Grading', 'Automatically run test cases against submitted code and compute scores.'),
        ('Password Hashing', 'Implement bcrypt hashing for student passwords.'),
        ('Question Randomisation', 'Shuffle question order per student to reduce copying.'),
        ('Linux & macOS Support', 'Full cross-platform deployment.'),
        ('Deeper AI Proctoring', 'Integrate MediaPipe Holistic for body-pose analysis (phone use, leaning).'),
        ('Cloud Backup', 'Optional encrypted backup of submissions to cloud storage.'),
        ('Multi-Subject Support', 'Allow multiple exam papers to be loaded simultaneously.'),
        ('Result Generation', 'Automated PDF report generation per student post-exam.'),
        ('Plagiarism Detection', 'Moss/JPLAG integration for submission similarity analysis.'),
    ]
)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  REFERENCES
# ════════════════════════════════════════════════════════════════
add_heading('REFERENCES', level=1)
refs = [
    'Electron Documentation — Electron Security Best Practices. https://www.electronjs.org/docs/latest/tutorial/security',
    'MediaPipe Documentation — Face Landmarker Task. https://developers.google.com/mediapipe/solutions/vision/face_landmarker',
    'Socket.io Documentation — Server API. https://socket.io/docs/v4/server-api/',
    'Monaco Editor — API Reference. https://microsoft.github.io/monaco-editor/',
    'sql.js — SQLite compiled to WebAssembly. https://sql.js.org/',
    'Express.js Documentation. https://expressjs.com/en/4x/api.html',
    'Node.js Crypto Module. https://nodejs.org/api/crypto.html',
    'NIST Special Publication 800-38A — Recommendation for Block Cipher Modes of Operation. https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38a.pdf',
    'Floratos, S. (2020). "AI-based Proctoring for Online Examinations." International Journal of Educational Technology.',
    'electron-builder Documentation — NSIS Target. https://www.electron.build/configuration/nsis',
]
for i, ref in enumerate(refs, 1):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(1)
    p.paragraph_format.first_line_indent = Cm(-1)
    run = p.add_run(f'[{i}]  {ref}')
    run.font.name = 'Times New Roman'
    run.font.size = Pt(11)
    p.paragraph_format.space_after = Pt(4)
add_page_break()

# ════════════════════════════════════════════════════════════════
#  APPENDIX A
# ════════════════════════════════════════════════════════════════
add_heading('APPENDIX A: KEY SOURCE CODE LISTING', level=1)

add_heading('A.1  License Verification — main.js', level=2)
add_code_block(
    "function checkLicense() {\n"
    "  if (!fs.existsSync(LICENSE_FILE)) return false;\n"
    "  try {\n"
    "    const encryptedData = fs.readFileSync(LICENSE_FILE, 'utf8');\n"
    "    const parts = encryptedData.split(':');\n"
    "    if (parts.length !== 2) return false;\n"
    "    const iv = Buffer.from(parts[0], 'hex');\n"
    "    const encryptedText = Buffer.from(parts[1], 'hex');\n"
    "    const decipher = crypto.createDecipheriv(\n"
    "      'aes-256-cbc',\n"
    "      Buffer.from(MASTER_SECRET.padEnd(32, '0')),\n"
    "      iv\n"
    "    );\n"
    "    let decrypted = Buffer.concat([\n"
    "      decipher.update(encryptedText), decipher.final()\n"
    "    ]);\n"
    "    return decrypted.toString() === getMachineUUID();\n"
    "  } catch (err) { return false; }\n"
    "}"
)

add_heading('A.2  AI Proctoring Violation Logic — camera-proctor.js', level=2)
add_code_block(
    "const WARN_POSE_TICKS = 12;   // 12 × 160ms = ~2 seconds\n\n"
    "if (consecutiveLeftCount >= WARN_POSE_TICKS) {\n"
    "  reportViolation({\n"
    "    type: 'LOOKING_BESIDE',\n"
    "    direction: 'left',\n"
    "    durationSeconds: 2,\n"
    "    snapshot: captureSnapshot()\n"
    "  });\n"
    "  consecutiveLeftCount = 0;\n"
    "}"
)

add_heading('A.3  Database Schema — db.js', level=2)
add_code_block(
    "db.run(`\n"
    "  CREATE TABLE IF NOT EXISTS students (\n"
    "    roll_number TEXT PRIMARY KEY,\n"
    "    name TEXT, password TEXT,\n"
    "    bound_ip TEXT DEFAULT NULL,\n"
    "    is_locked INTEGER DEFAULT 0,\n"
    "    assigned_questions TEXT DEFAULT '[]',\n"
    "    has_submitted INTEGER DEFAULT 0\n"
    "  );\n"
    "  CREATE TABLE IF NOT EXISTS submissions (\n"
    "    id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
    "    roll_number TEXT, question_id TEXT,\n"
    "    code TEXT, language TEXT, status TEXT, timestamp INTEGER,\n"
    "    FOREIGN KEY(roll_number) REFERENCES students(roll_number),\n"
    "    FOREIGN KEY(question_id) REFERENCES questions(id)\n"
    "  );\n"
    "`);"
)

add_heading('A.4  Secure Workspace Upload — server.js', level=2)
add_code_block(
    "// Verify upload token using timing-safe comparison\n"
    "const expected = uploadTokens.get(String(rollNumber));\n"
    "const tokenOk = expected && typeof token === 'string' &&\n"
    "  token.length === expected.length &&\n"
    "  crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));\n\n"
    "if (!tokenOk) {\n"
    "  return res.status(403).json({ success: false, error: 'Unauthorised' });\n"
    "}\n\n"
    "// Extract zip with path traversal protection\n"
    "const zip = new AdmZip(zipPath);\n"
    "for (const entry of zip.getEntries().filter(e => !e.isDirectory)) {\n"
    "  const name = safeFileName(path.basename(entry.entryName));\n"
    "  if (!name || entry.header.size > 2 * 1024 * 1024) continue;\n"
    "  fs.writeFileSync(path.join(studentDir, name), entry.getData());\n"
    "}"
)

# Save
out = r'c:\Minor-Project\Project_Report.docx'
doc.save(out)
print(f'[OK] Saved: {out}')
