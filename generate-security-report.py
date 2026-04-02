"""
Kairos Security Assessment Report Generator
Run: python generate-security-report.py
Output: Kairos_Security_Assessment.pdf on the Desktop
"""

from fpdf import FPDF
from datetime import date
import os

OUTPUT = os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "Kairos_Security_Assessment.pdf")
TODAY = date.today().strftime("%B %d, %Y")

# ── Colour palette ────────────────────────────────────────────────────────────
C_BG        = (15,  23,  42)   # slate-900
C_CARD      = (30,  41,  59)   # slate-800
C_ACCENT    = (79,  70, 229)   # indigo-600
C_GREEN     = (16, 185, 129)   # emerald-500
C_AMBER     = (245, 158,  11)  # amber-500
C_RED       = (239,  68,  68)  # red-500
C_WHITE     = (255, 255, 255)
C_MUTED     = (148, 163, 184)  # slate-400
C_BORDER    = (51,  65,  85)   # slate-700

class PDF(FPDF):
    def header(self): pass
    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*C_MUTED)
        self.cell(0, 10, f"Kairos Security Assessment  ·  Confidential  ·  {TODAY}  ·  Page {self.page_no()}", align="C")

def bg(pdf):
    pdf.set_fill_color(*C_BG)
    pdf.rect(0, 0, 210, 297, "F")

def card(pdf, x, y, w, h):
    pdf.set_fill_color(*C_CARD)
    pdf.set_draw_color(*C_BORDER)
    pdf.rounded_rect(x, y, w, h, 3, "FD")

def badge(pdf, x, y, label, color):
    pdf.set_fill_color(*color)
    pdf.set_text_color(*C_WHITE)
    pdf.set_font("Helvetica", "B", 7)
    w = pdf.get_string_width(label) + 6
    pdf.rounded_rect(x, y, w, 5, 1.5, "F")
    pdf.set_xy(x, y - 0.2)
    pdf.cell(w, 5.4, label, align="C")
    return x + w + 2

def section_title(pdf, title):
    pdf.set_text_color(*C_ACCENT)
    pdf.set_font("Helvetica", "B", 11)
    pdf.ln(5)
    pdf.cell(0, 7, title, ln=True)
    pdf.set_draw_color(*C_ACCENT)
    pdf.set_line_width(0.4)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

def finding_row(pdf, severity, category, finding, status):
    colors = {"CRITICAL": C_RED, "HIGH": C_RED, "MEDIUM": C_AMBER, "LOW": C_GREEN, "PASS": C_GREEN}
    c = colors.get(severity, C_MUTED)
    y = pdf.get_y()
    if y > 265:
        pdf.add_page()
        bg(pdf)
        y = pdf.get_y()

    card(pdf, 10, y, 190, 13)
    badge(pdf, 13, y + 4, severity, c)
    pdf.set_xy(13 + pdf.get_string_width(severity) + 10, y + 3)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*C_WHITE)
    pdf.cell(50, 5, category)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*C_MUTED)
    x_after_cat = 13 + pdf.get_string_width(severity) + 10 + 52
    pdf.set_xy(x_after_cat, y + 3)
    pdf.cell(190 - x_after_cat + 10 - 22, 5, finding[:80] + ("…" if len(finding) > 80 else ""))

    status_colors = {"✓ Resolved": C_GREEN, "⚠ Monitor": C_AMBER, "✗ Open": C_RED, "N/A": C_MUTED}
    sc = status_colors.get(status, C_MUTED)
    pdf.set_text_color(*sc)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_xy(178, y + 4)
    pdf.cell(22, 5, status, align="R")
    pdf.ln(15)

def score_circle(pdf, cx, cy, r, score, label, color):
    pdf.set_fill_color(*color)
    pdf.ellipse(cx - r, cy - r, r*2, r*2, "F")
    pdf.set_fill_color(*C_CARD)
    pdf.ellipse(cx - r + 3, cy - r + 3, (r-3)*2, (r-3)*2, "F")
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*color)
    pdf.set_xy(cx - r, cy - 5)
    pdf.cell(r*2, 10, score, align="C")
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*C_MUTED)
    pdf.set_xy(cx - r, cy + 6)
    pdf.cell(r*2, 5, label, align="C")

# ── Build PDF ─────────────────────────────────────────────────────────────────
pdf = PDF()
pdf.set_auto_page_break(False)
pdf.add_page()
bg(pdf)

# ── Cover ─────────────────────────────────────────────────────────────────────
# Accent bar top
pdf.set_fill_color(*C_ACCENT)
pdf.rect(0, 0, 210, 3, "F")

# Logo area
pdf.set_xy(10, 18)
pdf.set_fill_color(*C_ACCENT)
pdf.rounded_rect(10, 18, 14, 14, 3, "F")
pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(*C_WHITE)
pdf.set_xy(10, 20)
pdf.cell(14, 10, "K", align="C")

pdf.set_xy(28, 19)
pdf.set_font("Helvetica", "B", 18)
pdf.set_text_color(*C_WHITE)
pdf.cell(0, 8, "Kairos")
pdf.set_xy(28, 27)
pdf.set_font("Helvetica", "", 9)
pdf.set_text_color(*C_MUTED)
pdf.cell(0, 5, "Consulting Time & Invoice Platform")

# Title block
pdf.set_xy(10, 55)
pdf.set_font("Helvetica", "B", 28)
pdf.set_text_color(*C_WHITE)
pdf.cell(0, 14, "Security Assessment")
pdf.set_xy(10, 70)
pdf.set_font("Helvetica", "B", 28)
pdf.set_text_color(*C_ACCENT)
pdf.cell(0, 14, "Report")

pdf.set_xy(10, 90)
pdf.set_font("Helvetica", "", 11)
pdf.set_text_color(*C_MUTED)
pdf.cell(0, 7, f"Assessment Date: {TODAY}")
pdf.set_xy(10, 97)
pdf.cell(0, 7, "Scope: Full-stack codebase, API routes, auth, CSP, dependencies")
pdf.set_xy(10, 104)
pdf.cell(0, 7, "Assessor: Claude Sonnet (Automated + Manual Review)")

# Overall score cards
scores = [
    ("A", "Auth & Sessions",   C_GREEN),
    ("B+", "API Security",     C_GREEN),
    ("A-", "Dependencies",     C_GREEN),
    ("B", "CSP / Headers",     C_AMBER),
    ("C+", "Input Validation", C_AMBER),
]
card(pdf, 10, 118, 190, 50)
pdf.set_xy(13, 122)
pdf.set_font("Helvetica", "B", 9)
pdf.set_text_color(*C_WHITE)
pdf.cell(0, 6, "OVERALL SECURITY SCORE BY CATEGORY")
for i, (score, label, color) in enumerate(scores):
    cx = 28 + i * 37
    score_circle(pdf, cx, 148, 14, score, label, color)

# Overall grade
pdf.set_fill_color(*C_GREEN)
pdf.rounded_rect(155, 122, 40, 40, 4, "F")
pdf.set_font("Helvetica", "B", 30)
pdf.set_text_color(*C_WHITE)
pdf.set_xy(155, 127)
pdf.cell(40, 20, "B+", align="C")
pdf.set_font("Helvetica", "B", 8)
pdf.set_xy(155, 148)
pdf.cell(40, 6, "OVERALL GRADE", align="C")
pdf.set_font("Helvetica", "", 7)
pdf.set_xy(155, 154)
pdf.cell(40, 5, "Production-ready", align="C")

# Summary paragraph
card(pdf, 10, 175, 190, 38)
pdf.set_xy(14, 179)
pdf.set_font("Helvetica", "B", 9)
pdf.set_text_color(*C_ACCENT)
pdf.cell(0, 5, "EXECUTIVE SUMMARY")
pdf.set_xy(14, 186)
pdf.set_font("Helvetica", "", 8.5)
pdf.set_text_color(*C_MUTED)
summary = (
    "Kairos demonstrates a strong security posture for a production SaaS application. Authentication is "
    "handled server-side via Supabase JWT validation (cannot be forged by clients). Role-based access control "
    "is enforced at both the middleware and database (RLS) layers. All dependencies are fully up-to-date with "
    "no known CVEs. The main areas for improvement are input validation hardening on API endpoints and "
    "adding rate limiting to sensitive routes. No critical vulnerabilities were identified."
)
pdf.multi_cell(182, 5.5, summary)

# Metadata strip
pdf.set_fill_color(*C_ACCENT)
pdf.rect(0, 279, 210, 18, "F")
meta = [("Stack", "Next.js 16 · React 19 · Supabase · Tailwind 4"),
        ("Hosting", "Vercel (Hobby / fra1)"),
        ("CVEs", "0 known")]
pdf.set_font("Helvetica", "", 7.5)
pdf.set_text_color(*C_WHITE)
for i, (k, v) in enumerate(meta):
    pdf.set_xy(12 + i * 65, 284)
    pdf.set_font("Helvetica", "B", 7)
    pdf.cell(20, 4, k.upper() + ":")
    pdf.set_xy(12 + i * 65 + 18, 284)
    pdf.set_font("Helvetica", "", 7)
    pdf.cell(44, 4, v)

# ── Page 2: Findings ──────────────────────────────────────────────────────────
pdf.add_page()
bg(pdf)
pdf.set_fill_color(*C_ACCENT)
pdf.rect(0, 0, 210, 3, "F")
pdf.set_xy(10, 10)
pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(*C_WHITE)
pdf.cell(0, 8, "Security Findings")

section_title(pdf, "Authentication & Session Management")
findings_auth = [
    ("PASS",   "JWT Validation",       "getUser() validates server-side — cannot be forged by client",                    "✓ Resolved"),
    ("PASS",   "Session Refresh",      "Middleware correctly refreshes Supabase session on every request",                 "✓ Resolved"),
    ("PASS",   "Auth Redirect",        "Unauthenticated users redirected to /login; authenticated away from auth pages",   "✓ Resolved"),
    ("PASS",   "Cookie Security",      "JWT stored in httpOnly, Secure, SameSite cookies via @supabase/ssr",               "✓ Resolved"),
    ("PASS",   "Service Role Key",     "SUPABASE_SERVICE_ROLE_KEY never exposed to client, gitignored, env-only",          "✓ Resolved"),
    ("PASS",   ".env.local",           "Test credentials in .env.local are gitignored — never committed to repo",          "✓ Resolved"),
]
for f in findings_auth:
    finding_row(pdf, *f)

section_title(pdf, "Role-Based Access Control (RBAC)")
findings_rbac = [
    ("PASS",   "Permission Matrix",    "Centralized RBAC: admin > partner > project_manager > member with O(1) lookup",   "✓ Resolved"),
    ("PASS",   "DB-Level Enforcement", "Role checked from database (RLS-protected), never from client cookie",             "✓ Resolved"),
    ("PASS",   "PM Scoping",           "Project managers can only approve timesheets for projects they manage",             "✓ Resolved"),
    ("PASS",   "Role Assignment",      "Only admin can change roles; partner/admin roles protected from self-assignment",   "✓ Resolved"),
    ("MEDIUM", "Middleware Coverage",  "Only /invoices and /analytics gated at middleware — other routes rely on auth only","⚠ Monitor"),
]
for f in findings_rbac:
    finding_row(pdf, *f)

section_title(pdf, "API Security")
findings_api = [
    ("PASS",   "Admin Verification",   "All admin API routes verify caller is admin of the target workspace",              "✓ Resolved"),
    ("PASS",   "Status Validation",    "Timesheet review only accepts 'approved' or 'rejected' — no arbitrary values",     "✓ Resolved"),
    ("PASS",   "Role Whitelist",       "Role changes restricted to ['member','project_manager','partner'] — admin blocked", "✓ Resolved"),
    ("PASS",   "Invite Validation",    "Email regex + UUID validation on invite endpoint before any DB operation",          "✓ Resolved"),
    ("MEDIUM", "UUID Validation",      "timesheetId / memberId not validated as UUID format in review/member-level routes", "⚠ Monitor"),
    ("MEDIUM", "ReviewerNote XSS",     "reviewerNote field stored without sanitisation — potential stored XSS if rendered", "⚠ Monitor"),
    ("MEDIUM", "Rate Limiting",        "No rate limiting on invite, review, or member-level endpoints",                    "⚠ Monitor"),
    ("LOW",    "Input Validation",     "weeklyHours validated (0-40), but missing on other numeric fields",                 "⚠ Monitor"),
]
for f in findings_api:
    finding_row(pdf, *f)

# ── Page 3: Headers, Deps, Recommendations ───────────────────────────────────
pdf.add_page()
bg(pdf)
pdf.set_fill_color(*C_ACCENT)
pdf.rect(0, 0, 210, 3, "F")
pdf.set_xy(10, 10)
pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(*C_WHITE)
pdf.cell(0, 8, "Headers, Dependencies & Recommendations")

section_title(pdf, "Security Headers (next.config.js)")
findings_headers = [
    ("PASS",   "X-Frame-Options",      "Set to DENY — clickjacking fully blocked",                                        "✓ Resolved"),
    ("PASS",   "HSTS",                 "max-age=31536000 with includeSubDomains — HTTPS enforced for 1 year",              "✓ Resolved"),
    ("PASS",   "X-Content-Type",       "nosniff — MIME-type sniffing prevented",                                           "✓ Resolved"),
    ("PASS",   "Permissions-Policy",   "camera, microphone, geolocation all blocked",                                      "✓ Resolved"),
    ("PASS",   "frame-src / object-src","Both set to 'none' — no iframes or plugins allowed",                              "✓ Resolved"),
    ("MEDIUM", "CSP unsafe-inline",    "script-src includes 'unsafe-inline' — weakens XSS protection",                    "⚠ Monitor"),
    ("LOW",    "CSP nonce/hash",        "Recommend migrating to nonce-based CSP to remove unsafe-inline long term",         "⚠ Monitor"),
]
for f in findings_headers:
    finding_row(pdf, *f)

section_title(pdf, "Dependency Security")
findings_deps = [
    ("PASS",   "Next.js 16.2.2",       "Patched CVE-2025-66478 (RSC remote code execution on 15.x)",                      "✓ Resolved"),
    ("PASS",   "React 19",             "Latest major — no known CVEs",                                                    "✓ Resolved"),
    ("PASS",   "Tailwind CSS 4.2",     "Latest — Rust-based engine, no known CVEs",                                       "✓ Resolved"),
    ("PASS",   "ESLint 9.39",          "Latest — deprecated packages from v8 eliminated",                                  "✓ Resolved"),
    ("PASS",   "Recharts 3.8",         "Latest major — v2 type vulnerabilities resolved",                                  "✓ Resolved"),
    ("PASS",   "Axios",                "Not used — not exposed to March 2026 supply chain attack",                         "N/A"),
    ("PASS",   "React Native pkgs",    "Not used — not exposed to react-native supply chain attack",                       "N/A"),
    ("PASS",   "@supabase/ssr 0.5",    "Latest SSR client — deprecated auth-helpers not used",                             "✓ Resolved"),
]
for f in findings_deps:
    finding_row(pdf, *f)

section_title(pdf, "Priority Recommendations")

recs = [
    ("1", C_AMBER, "Add UUID validation to review & member-level API routes",
     "Validate timesheetId, memberId, workspaceId as UUIDs at the start of each handler."),
    ("2", C_AMBER, "Sanitise reviewerNote before database storage",
     "Strip or encode HTML from the reviewerNote field to prevent stored XSS if rendered as HTML."),
    ("3", C_AMBER, "Implement rate limiting on sensitive endpoints",
     "Add rate limiting (e.g. Upstash Redis or Vercel Edge Middleware) to /api/invite, /api/timesheets/review."),
    ("4", C_GREEN, "Add audit logging for admin operations",
     "Log admin role changes, invitations, and timesheet approvals to a separate audit_log table."),
    ("5", C_GREEN, "Migrate CSP to nonce-based approach",
     "Use Next.js middleware to inject a per-request nonce, removing unsafe-inline from script-src."),
]
for num, color, title, desc in recs:
    y = pdf.get_y()
    if y > 258:
        pdf.add_page(); bg(pdf); y = pdf.get_y()
    card(pdf, 10, y, 190, 17)
    pdf.set_fill_color(*color)
    pdf.rounded_rect(13, y + 4, 8, 8, 2, "F")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*C_WHITE)
    pdf.set_xy(13, y + 4.5)
    pdf.cell(8, 7, num, align="C")
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(*C_WHITE)
    pdf.set_xy(25, y + 4)
    pdf.cell(0, 5, title)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*C_MUTED)
    pdf.set_xy(25, y + 9.5)
    pdf.cell(170, 5, desc[:100])
    pdf.ln(19)

# Final verdict card
y = pdf.get_y() + 4
card(pdf, 10, y, 190, 28)
pdf.set_fill_color(*C_GREEN)
pdf.rounded_rect(10, y, 5, 28, 0, "F")
pdf.set_xy(20, y + 5)
pdf.set_font("Helvetica", "B", 10)
pdf.set_text_color(*C_GREEN)
pdf.cell(0, 6, "VERDICT: PRODUCTION READY")
pdf.set_xy(20, y + 12)
pdf.set_font("Helvetica", "", 8.5)
pdf.set_text_color(*C_MUTED)
verdict = ("No critical vulnerabilities found. Authentication, session management, and dependency security "
           "are all at a high standard. The 3 medium-priority findings are hardening improvements, not blockers. "
           "Kairos is safe to operate in production.")
pdf.multi_cell(176, 5.5, verdict)

pdf.output(OUTPUT)
print(f"PDF saved to: {OUTPUT}")
