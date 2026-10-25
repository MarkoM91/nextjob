"""Create the fictional, selectable-text PDF used for NextJOB closed-test QA.

Run with Python and reportlab installed:
    python android/test-assets/generate_sample_cv.py

The output is intentionally a simple, one-column ATS-style CV. Every person,
employer and education entry below is fictional. No working phone is included.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


OUTPUT = Path(__file__).with_name("NextJOB-Sample-CV.pdf")
INK = colors.HexColor("#152D2A")
TEAL = colors.HexColor("#126B5C")
MUTED = colors.HexColor("#53635F")
LINE = colors.HexColor("#CCD8D3")

STYLES = {
    "sample": ParagraphStyle(
        "Sample", fontName="Helvetica-Bold", fontSize=8.4, leading=12,
        textColor=TEAL, spaceAfter=16,
    ),
    "name": ParagraphStyle(
        "Name", fontName="Helvetica-Bold", fontSize=29, leading=33,
        textColor=INK, spaceAfter=5,
    ),
    "role": ParagraphStyle(
        "Role", fontName="Helvetica", fontSize=13, leading=18,
        textColor=INK, spaceAfter=5,
    ),
    "contact": ParagraphStyle(
        "Contact", fontName="Helvetica", fontSize=9.7, leading=14,
        textColor=MUTED, spaceAfter=14,
    ),
    "heading": ParagraphStyle(
        "Heading", fontName="Helvetica-Bold", fontSize=10.6, leading=14,
        textColor=TEAL, spaceBefore=15, spaceAfter=7,
    ),
    "body": ParagraphStyle(
        "Body", fontName="Helvetica", fontSize=10, leading=14.5,
        textColor=INK, alignment=TA_LEFT, spaceAfter=5,
    ),
    "job": ParagraphStyle(
        "Job", fontName="Helvetica-Bold", fontSize=10.5, leading=15,
        textColor=INK, spaceAfter=2,
    ),
    "meta": ParagraphStyle(
        "Meta", fontName="Helvetica", fontSize=9.5, leading=13,
        textColor=MUTED, spaceAfter=6,
    ),
    "bullet": ParagraphStyle(
        "Bullet", fontName="Helvetica", fontSize=9.8, leading=14,
        textColor=INK, leftIndent=11, firstLineIndent=0,
        bulletIndent=0, spaceAfter=4,
    ),
}


def paragraph(text, style="body"):
    return Paragraph(text, STYLES[style])


def section(title):
    return paragraph(title.upper(), "heading")


def job(role, employer, period, bullets):
    rows = [paragraph(role, "job"), paragraph(f"{employer} | Milan, Italy | {period}", "meta")]
    rows.extend(Paragraph(text, STYLES["bullet"], bulletText="-") for text in bullets)
    return KeepTogether(rows)


def page_decoration(canvas, document):
    canvas.saveState()
    width, _ = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(document.leftMargin, 39, width - document.rightMargin, 39)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(document.leftMargin, 26, "FICTIONAL SAMPLE | For NextJOB testing only. Not a real job application.")
    canvas.drawRightString(width - document.rightMargin, 26, str(document.page))
    canvas.restoreState()


def main():
    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=44, rightMargin=44, topMargin=35, bottomMargin=53,
        title="NextJOB Sample CV - Alex Morgan (fictional)",
        author="NextJOB", subject="Fictional CV for Android and closed-test QA",
        pageCompression=1,
    )
    story = [
        paragraph("SAMPLE CV FOR TESTING - ALL DETAILS ARE FICTIONAL", "sample"),
        paragraph("Alex Morgan", "name"),
        paragraph("IT Support Specialist", "role"),
        paragraph("Milan, Italy | alex.morgan@example.invalid", "contact"),
        HRFlowable(width="100%", thickness=1.2, color=TEAL),
        section("Professional summary"),
        paragraph(
            "IT support professional with four years of experience supporting office users, "
            "Windows workstations and cloud productivity tools. Practical experience with "
            "Microsoft 365, Google Workspace and basic network troubleshooting. Clear "
            "communication, accurate ticket notes and a patient approach to user support."
        ),
        section("Technical skills"),
        paragraph("<b>Workplace support:</b> Windows 10/11, Microsoft 365, Google Workspace, PC and printer setup, software troubleshooting."),
        paragraph("<b>Networks and tools:</b> TCP/IP, DNS, DHCP, VPN checks, ticket documentation, PowerShell (basic), HTML and CSS (basic)."),
        section("Work experience"),
        job(
            "IT Support Technician", "Example Office Services (fictional)", "Jan 2019 - Jan 2023",
            [
                "Installed and configured Windows laptops, desktop PCs and printers for an office of 45 staff.",
                "Managed Microsoft 365 and Google Workspace accounts, reset passwords, assigned licences and resolved sign-in issues.",
                "Investigated connectivity problems using TCP/IP, DNS, DHCP and VPN checks; escalated network incidents when needed.",
                "Recorded support tickets and repair notes, wrote troubleshooting guides and explained fixes to non-technical colleagues.",
            ],
        ),
        Spacer(1, 8),
        job(
            "Junior Support Assistant (internship)", "Example Digital Studio (fictional)", "Jun 2018 - Dec 2018",
            [
                "Assisted with device inventories, software installations and workstation setup under a senior technician.",
                "Updated internal help pages with HTML and CSS and checked their behaviour in common web browsers.",
            ],
        ),
        section("Education"),
        paragraph("Diploma in Information Technology", "job"),
        paragraph("Example Technical College (fictional) | Milan, Italy | 2018", "meta"),
        section("Languages"),
        paragraph("Italian - fluent | English - B2 (working proficiency)"),
    ]
    document.build(story, onFirstPage=page_decoration, onLaterPages=page_decoration)
    print(OUTPUT.resolve())


if __name__ == "__main__":
    main()
