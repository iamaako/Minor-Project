import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (pages 2+)
        if self._pageNumber > 1:
            self.drawString(40, 810, "AMU Secure Test Portal — AI Webcam Proctoring Specification")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(40, 804, 555, 804)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(40, 45, 555, 45)
        self.drawString(40, 32, "Interdisciplinary Centre for Artificial Intelligence — Aligarh Muslim University")
        self.drawRightString(555, 32, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()

def generate_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=45,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a")
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#2563eb"),
        spaceAfter=10
    )

    h1_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1e3a8a"),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'SubSectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
        alignment=4 # Justified
    )

    meta_style = ParagraphStyle(
        'MetaText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor("#475569")
    )

    bullet_style = ParagraphStyle(
        'BulletText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
        leftIndent=12,
        spaceAfter=3
    )

    formula_style = ParagraphStyle(
        'FormulaText',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        alignment=1 # Center
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0f172a")
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#334155")
    )

    table_cell_code = ParagraphStyle(
        'TableCellCode',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # Title & Header
    story.append(Paragraph("Aligarh Muslim University", title_style))
    story.append(Paragraph("Secure Test Portal — AI Webcam Proctoring & Neighbor Detection", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#2563eb"), spaceAfter=10))

    # Meta Info Box Table
    meta_data = [
        [
            Paragraph("<b>Module:</b> Computer Vision Anti-Cheat", meta_style),
            Paragraph("<b>Platform:</b> Electron.js / Node.js", meta_style),
        ],
        [
            Paragraph("<b>Deployment:</b> 100% Offline (Local LAN)", meta_style),
            Paragraph("<b>Vision Engine:</b> Face-API / TensorFlow.js WebGL", meta_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[250, 265])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # Section 1: Executive Overview
    story.append(Paragraph("1. Executive Summary & Purpose", h1_style))
    story.append(Paragraph(
        "In university computer laboratory coding examinations, visual collusion—specifically glancing sideways at an adjacent candidate's monitor or conferring with neighboring students—presents a persistent academic integrity vulnerability. The <b>AI Webcam Proctoring & Neighbor Detection</b> feature delivers continuous, on-device facial landmark and head-pose telemetry directly within the AMU Student Portal. It automatically flags neighbor-peeking behavior, issues localized student warnings, captures photographic evidence, and alerts invigilators over the local network in real time.",
        body_style
    ))

    # Section 2: Key Highlights
    story.append(Paragraph("2. Key Highlights", h1_style))

    highlights = [
        ("100% Offline On-Device Computer Vision (No Cloud Required)",
         "Operates completely without external internet connectivity. Neural network weights for TinyFaceDetector and FaceLandmark68 are stored locally in the application package, ensuring zero cloud dependency, zero external API latency, and maximum privacy compliance for air-gapped lab testing."),
        
        ("Biometric Facial Symmetry & Head Yaw Tracking",
         "Extracts 68 facial landmark coordinates 7–8 times per second. By computing Euclidean symmetry ratios between the nose tip and outer eye corners, the algorithm accurately determines whether a student is facing their monitor, looking left, or looking right towards a peer."),
        
        ("Multi-Stage Violation & Grace Period Lifecycle",
         "Includes intelligent temporal debouncing: brief natural blinks or minor neck movements (&lt; 1.0s) are ignored; sustained head turns (&ge; 1.0s) trigger an amber warning state; turns exceeding 2.0 seconds record an official violation, capture an evidence JPEG frame, and notify the teacher."),
        
        ("Floating Windows XP Picture-in-Picture (PiP) Interface",
         "Features an authentic Windows XP-styled draggable, minimizable floating webcam window. Displays the live video feed (mirrored naturally) alongside an overlay canvas rendering real-time face bounding boxes and direction tags (✓ SCREEN FOCUS, ⚠ LOOKING RIGHT, ⚠ LOOKING LEFT)."),
        
        ("Automatic Evidentiary Snapshot & Server Synchronization",
         "When an infraction is verified, an offscreen canvas captures a compressed JPEG frame and immediately dispatches it via Socket.io to the Teacher Admin Server with candidate identity, seat number, and violation metrics.")
    ]

    for title, desc in highlights:
        h_table_data = [[
            Paragraph(f"<b>{title}</b>", h2_style),
        ], [
            Paragraph(desc, body_style)
        ]]
        h_box = Table(h_table_data, colWidths=[515])
        h_box.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
            ('LINELEFT', (0,0), (0,-1), 3, colors.HexColor("#2563eb")),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        story.append(h_box)
        story.append(Spacer(1, 5))

    story.append(PageBreak())

    # Section 3: Technical Details: How It Works
    story.append(Paragraph("3. Technical Details: How It Works", h1_style))
    story.append(Paragraph(
        "The proctoring system operates in an automated pipeline: <b>Frame Ingestion &rarr; Neural Landmark Inference &rarr; Mathematical Yaw Calculation &rarr; Temporal Thresholding &rarr; Alert Dispatch</b>.",
        body_style
    ))

    # Pipeline Grid
    pipe_data = [
        [
            Paragraph("<b>📷 1. Frame Ingestion</b><br/>Captured via <code>getUserMedia</code> at 320&times;240 (15–20 FPS). Camera permissions are granted silently in Electron via session handlers without prompting user dialogs.", meta_style),
            Paragraph("<b>🧠 2. Landmark Detection</b><br/>WebGL-accelerated <code>TinyFaceDetector</code> identifies face bounds; <code>FaceLandmark68Net</code> maps 68 anatomical coordinates across jawline, eyes, nose, and mouth.", meta_style)
        ],
        [
            Paragraph("<b>📐 3. Geometric Yaw Analysis</b><br/>Computes nose tip (Point 30) displacement relative to eye corners (Points 36 &amp; 45) and checks Euclidean symmetry ratio.", meta_style),
            Paragraph("<b>🚨 4. Alert & Evidence Dispatch</b><br/>Upon reaching 2.0s threshold, captures JPEG snapshot, triggers student warning banner, and emits socket event to teacher dashboard.", meta_style)
        ]
    ]
    pipe_table = Table(pipe_data, colWidths=[250, 265])
    pipe_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#ffffff")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(pipe_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("Mathematical Formulation & Decision Boundaries", h2_style))
    
    formula_data = [[
        Paragraph(
            "<b>Symmetry Ratio</b> = Distance(Nose Tip [30], Eye Right Outer [36]) / Distance(Eye Left Outer [45], Nose Tip [30])<br/>"
            "<b>Nose Offset X</b> = (Nose Tip X - Eye Midpoint X) / Eye Span Width",
            formula_style
        )
    ]]
    f_box = Table(formula_data, colWidths=[515])
    f_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(f_box)
    story.append(Spacer(1, 6))

    story.append(Paragraph("• <b>Facing Screen (Normal):</b> Symmetry Ratio between 0.60 and 1.65; |Nose Offset X| &le; 0.16. Status: <i>Green (Safe)</i>.", bullet_style))
    story.append(Paragraph("• <b>Looking Right (Neighbor on Right):</b> Symmetry Ratio &gt; 1.65 or Nose Offset X &gt; +0.16. Sustained &ge; 2.0s triggers <i>Violation</i>.", bullet_style))
    story.append(Paragraph("• <b>Looking Left (Neighbor on Left):</b> Symmetry Ratio &lt; 0.60 or Nose Offset X &lt; -0.16. Sustained &ge; 2.0s triggers <i>Violation</i>.", bullet_style))
    story.append(Paragraph("• <b>No Face Detected / Candidate Absent:</b> Zero faces detected for &gt; 3.0s continuously triggers absence alarm.", bullet_style))

    story.append(Spacer(1, 8))

    # Section 4: Architecture & Files Table
    story.append(Paragraph("4. Architecture & File Implementation Summary", h1_style))
    story.append(Paragraph(
        "The following table details all architectural files created or updated to establish the offline webcam proctoring pipeline across the student portal and admin server:",
        body_style
    ))

    table_data = [
        [
            Paragraph("<b>Component</b>", table_header_style),
            Paragraph("<b>File Path</b>", table_header_style),
            Paragraph("<b>Description</b>", table_header_style)
        ],
        [
            Paragraph("<b>Detection Engine</b>", table_cell_style),
            Paragraph("src/renderer/js/webcamProctor.js", table_cell_code),
            Paragraph("Core AI detection loop, head pose angle calculation, snapshot capture, and warning trigger.", table_cell_style)
        ],
        [
            Paragraph("<b>PiP Styles</b>", table_cell_style),
            Paragraph("src/renderer/css/webcam.css", table_cell_code),
            Paragraph("Windows XP styled draggable PiP box, status indicators, and warning animations.", table_cell_style)
        ],
        [
            Paragraph("<b>Offline Models</b>", table_cell_style),
            Paragraph("src/renderer/assets/models/", table_cell_code),
            Paragraph("Bundled model weights (<code>tiny_face_detector</code> and <code>face_landmark_68</code>).", table_cell_style)
        ],
        [
            Paragraph("<b>Offline Library</b>", table_cell_style),
            Paragraph("src/renderer/js/lib/face-api.js", table_cell_code),
            Paragraph("Standalone Face-API bundle with embedded TensorFlow.js WebGL runtime.", table_cell_style)
        ],
        [
            Paragraph("<b>UI Integration</b>", table_cell_style),
            Paragraph("src/renderer/index.html", table_cell_code),
            Paragraph("Added PiP widget HTML markup, CSS stylesheet link, and script references.", table_cell_style)
        ],
        [
            Paragraph("<b>App Lifecycle</b>", table_cell_style),
            Paragraph("src/renderer/js/app.js", table_cell_code),
            Paragraph("Hooks <code>WebcamProctor.init()</code> on startup, <code>start()</code> during exam, and <code>stop()</code> on submit.", table_cell_style)
        ],
        [
            Paragraph("<b>Bridge API</b>", table_cell_style),
            Paragraph("src/main/preload.js", table_cell_code),
            Paragraph("Exposed <code>reportWebcamViolation</code> safely to renderer via <code>contextBridge</code>.", table_cell_style)
        ],
        [
            Paragraph("<b>Main Process</b>", table_cell_style),
            Paragraph("src/main/main.js", table_cell_code),
            Paragraph("Granted media permissions automatically and forwarded violations via Socket.io.", table_cell_style)
        ],
        [
            Paragraph("<b>Teacher Server</b>", table_cell_style),
            Paragraph("AMUAdminServer/server.js", table_cell_code),
            Paragraph("Added <code>webcam_violation</code> socket listener to log alerts and forward evidence snapshots to the invigilator dashboard.", table_cell_style)
        ]
    ]

    files_table = Table(table_data, colWidths=[90, 185, 240])
    files_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
    ]))
    story.append(files_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF generated successfully at: {output_path}")

if __name__ == '__main__':
    out_pdf = r"d:\B.Tech\5th Semester\Minor Project\Project\Minor-Project\AMU_Webcam_Proctoring_Feature_Report.pdf"
    generate_pdf(out_pdf)
