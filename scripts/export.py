"""Export A-frame drawings as PNGs, individual PDFs, and one drawing set."""

from __future__ import annotations

import argparse
import base64
import html as html_lib
import io
import json
import re
import shutil
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
PNG_DIR = ROOT / "output" / "png"
PDF_DIR = ROOT / "output" / "pdf"
TMP_PDF = ROOT / "tmp" / "pdfs"
DRAWING_SUMMARY = ROOT / "output" / "data" / "drawing-summary.json"
SITE_MAP_PNG = PNG_DIR / "site-top-down-map.png"
BUILDINGS = ("hall", "shell6", "shell6d", "shell8")
# Buildings drawn by the generic sheet (src/render-building.mjs). Page 2 of each
# is the same sheet with its technical audit layer switched on.
FORMS = ("cabin", "shed", "wedge", "rack", "arch-hall", "segmental-hall", "pointed-hall", "lavvo", "dome")
FORM_SUMMARY = ROOT / "output" / "data" / "buildings.json"
FORM_LABELS = (
    "PLAN / PLANTEGNING",
    "3D SKETCH / 3D-SKISSE",
    "SIDE ELEVATION / LANGFASADE",
    "END ELEVATION / GAVLFASADE",
    "TECHNICAL DRAWING AUDIT / KONTROLL",
)
SHEET_WIDTH = 1000
SHEET_HEIGHT = 1410
PNG_SCALE = 3
REQUIRED_LABELS = (
    "TOP DOWN / OVERSIKTSBILDE",
    "3D SKETCH / 3D-SKISSE",
    "A-FRAME / TRIANGELFASADE",
    "SIDE VIEW / LANGFASADE",
    "X · LENGTH / LENGDE",
    "Y · WIDTH / BREDDE",
    "Z · HEIGHT / HØYDE",
)
REQUIRED_CHECKPOINT_LABELS = (
    "TOP-DOWN LAYER STATES / LAGVIS OVERSIKT",
    "BJELKELAG + HØNSENETTING",
    "KUBBING + ISOLASJON",
    "TOPPDEKKE / FLOOR LAYER",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--browser",
        choices=("auto", "chrome", "firefox"),
        default="auto",
        help="Browser that draws the sheets. auto uses Chrome, Chromium or Edge when found, otherwise Firefox.",
    )
    parser.add_argument(
        "--building",
        action="append",
        choices=BUILDINGS + FORMS,
        help="Export only this building; repeat to select more than one.",
    )
    parser.add_argument(
        "--checkpoint-only",
        action="store_true",
        help="Regenerate page 2 and reuse page 1 from the existing building PDF.",
    )
    return parser.parse_args()


def find_chrome() -> Path:
    import os
    configured = os.environ.get("CHROME_PATH")
    if configured and Path(configured).exists():
        return Path(configured)
    for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
        found = shutil.which(name)
        if found:
            return Path(found)
    candidates = (
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Chrome, Chromium or Edge is required for HTML export; set CHROME_PATH to its executable")


class Firefox:
    """Firefox through geckodriver and the WebDriver protocol.

    Firefox has no command-line flags for a scaled screenshot or for printing to
    PDF, so the exporter asks a running browser for them. One browser is started
    per device scale and reused for every sheet at that scale.
    """

    def __init__(self) -> None:
        self.driver = shutil.which("geckodriver")
        if not self.driver or not shutil.which("firefox"):
            raise FileNotFoundError("Firefox export needs both firefox and geckodriver on the PATH")
        self.sessions: dict[int, tuple[subprocess.Popen, str]] = {}

    def _call(self, base: str, method: str, path: str, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)["value"]

    def _session(self, scale: int) -> str:
        if scale in self.sessions:
            return self.sessions[scale][1]
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        process = subprocess.Popen([self.driver, "--port", str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f"http://127.0.0.1:{port}"
        deadline = time.monotonic() + 15
        while True:
            try:
                self._call(base, "GET", "/status")
                break
            except OSError:
                if time.monotonic() > deadline:
                    process.terminate()
                    raise RuntimeError("geckodriver did not start")
                time.sleep(0.1)
        options = {"args": ["-headless", "--width=1600", "--height=1600"], "prefs": {"layout.css.devPixelsPerPx": f"{scale}.0"}}
        created = self._call(base, "POST", "/session", {"capabilities": {"alwaysMatch": {"browserName": "firefox", "moz:firefoxOptions": options}}})
        address = f"{base}/session/{created['sessionId']}"
        self.sessions[scale] = (process, address)
        return address

    def screenshot(self, html_path: Path, output: Path, scale: int, fragment: str = "") -> None:
        session = self._session(scale)
        self._call(session, "POST", "/url", {"url": html_path.as_uri() + fragment})
        element = self._call(session, "POST", "/element", {"using": "css selector", "value": "svg"})
        encoded = self._call(session, "GET", f"/element/{next(iter(element.values()))}/screenshot")
        output.write_bytes(base64.b64decode(encoded))

    def pdf(self, html_path: Path, output: Path, fragment: str = "") -> None:
        session = self._session(PNG_SCALE)
        # A fragment alone does not reload a page that is already open, so leave it first.
        self._call(session, "POST", "/url", {"url": "about:blank"})
        self._call(session, "POST", "/url", {"url": html_path.as_uri() + fragment})
        # A3 portrait with the sheets' own 5 mm margin, in centimetres.
        encoded = self._call(session, "POST", "/print", {
            "page": {"width": 29.7, "height": 42.0},
            "margin": {"top": 0.5, "bottom": 0.5, "left": 0.5, "right": 0.5},
            "background": True,
            "shrinkToFit": True,
        })
        output.write_bytes(base64.b64decode(encoded))

    def close(self) -> None:
        for process, address in self.sessions.values():
            try:
                self._call(address, "DELETE", "")
            except OSError:
                pass
            process.terminate()
        self.sessions.clear()


def find_browser(choice: str):
    if choice == "firefox":
        return Firefox()
    if choice == "chrome":
        return find_chrome()
    try:
        return find_chrome()
    except FileNotFoundError:
        return Firefox()


def wait_for_file(path: Path, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists() and path.stat().st_size > 0:
            return
        time.sleep(0.1)
    raise RuntimeError(f"Browser did not create {path}")


def run_browser(chrome: Path, args: list[str], profile_name: str) -> None:
    profile = TMP_PDF / profile_name
    if profile.exists():
        shutil.rmtree(profile)
    command = [
        str(chrome),
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--user-data-dir={profile}",
        *args,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def verify_labels(html_path: Path) -> None:
    source = html_path.read_text(encoding="utf-8")
    missing = [label for label in REQUIRED_LABELS if label not in source]
    if missing:
        raise RuntimeError(f"{html_path.name} is missing labels: {', '.join(missing)}")
    if source.count('class="concrete-rail concrete-rail-plan"') != 2:
        raise RuntimeError(f"{html_path.name} must show two long-side concrete rails in plan")
    if source.count('class="concrete-rail concrete-rail-side"') != 1:
        raise RuntimeError(f"{html_path.name} must show the near concrete rail in side view")


def verify_form_sheet(html_path: Path) -> None:
    source = html_path.read_text(encoding="utf-8")
    missing = [label for label in FORM_LABELS if label not in source]
    if missing:
        raise RuntimeError(f"{html_path.name} is missing labels: {', '.join(missing)}")
    if 'data-failed="0"' not in source:
        raise RuntimeError(f"{html_path.name} has failing audit checks")


def verify_checkpoint_labels(html_path: Path) -> None:
    source = html_path.read_text(encoding="utf-8")
    missing = [label for label in REQUIRED_CHECKPOINT_LABELS if label not in source]
    if missing:
        raise RuntimeError(f"{html_path.name} is missing checkpoint labels: {', '.join(missing)}")
    if source.count('data-layer-state=') != 3:
        raise RuntimeError(f"{html_path.name} must contain exactly three construction layer states")
    if 'data-layer-door-set=' not in source:
        raise RuntimeError(f"{html_path.name} must show emergency doors in the finished-floor state")


def export_png(chrome: Path, building: str, html_path: Path, fragment: str = "") -> Path:
    output = PNG_DIR / f"{building}.png"
    output.unlink(missing_ok=True)
    if isinstance(chrome, Firefox):
        chrome.screenshot(html_path, output, PNG_SCALE, fragment)
    else:
        run_browser(
            chrome,
            [
                "--hide-scrollbars",
                f"--force-device-scale-factor={PNG_SCALE}",
                f"--window-size={SHEET_WIDTH},{SHEET_HEIGHT}",
                f"--screenshot={output}",
                html_path.as_uri() + fragment,
            ],
            f"chrome-{building}-png",
        )
    wait_for_file(output)
    with Image.open(output) as image:
        expected = (SHEET_WIDTH * PNG_SCALE, SHEET_HEIGHT * PNG_SCALE)
        if image.size != expected:
            raise RuntimeError(f"{output.name} is {image.size}, expected {expected}")
        if image.getbbox() is None:
            raise RuntimeError(f"{output.name} is blank")
    return output


def export_pdf_page(chrome: Path, page_name: str, html_path: Path, fragment: str = "") -> Path:
    output = TMP_PDF / f"{page_name}.pdf"
    output.unlink(missing_ok=True)
    if isinstance(chrome, Firefox):
        chrome.pdf(html_path, output, fragment)
    else:
        run_browser(
            chrome,
            [
                "--no-pdf-header-footer",
                "--print-to-pdf-no-header",
                f"--print-to-pdf={output}",
                html_path.as_uri() + fragment,
            ],
            f"chrome-{page_name}-pdf",
        )
    wait_for_file(output)
    reader = PdfReader(str(output))
    if len(reader.pages) != 1:
        raise RuntimeError(f"{output.name} has {len(reader.pages)} pages, expected 1")
    return output



def mm_text(value: int | float) -> str:
    return f"{int(round(value)):,}".replace(",", " ")


def draw_wrapped(pdf, text, x, y, max_width, font="Helvetica", size=10, leading=14):
    pdf.setFont(font, size)
    cursor = y
    for paragraph in text.split("\n"):
        words = paragraph.split()
        line = ""
        for word in words:
            candidate = word if not line else f"{line} {word}"
            if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
                line = candidate
            else:
                pdf.drawString(x, cursor, line)
                cursor -= leading
                line = word
        if line:
            pdf.drawString(x, cursor, line)
            cursor -= leading
        cursor -= leading * 0.25
    return cursor


def draw_page_frame(pdf, page_width, page_height):
    pdf.setLineWidth(0.8)
    pdf.rect(20, 18, page_width - 40, page_height - 36)


def draw_image_contain(pdf, image_path, x, y, width, height, border=True):
    with Image.open(image_path) as image:
        source_width, source_height = image.size
    scale = min(width / source_width, height / source_height)
    draw_width = source_width * scale
    draw_height = source_height * scale
    draw_x = x + (width - draw_width) / 2
    draw_y = y + (height - draw_height) / 2
    pdf.drawImage(str(image_path), draw_x, draw_y, width=draw_width, height=draw_height, preserveAspectRatio=True, mask="auto")
    if border:
        pdf.setLineWidth(0.6)
        pdf.rect(draw_x, draw_y, draw_width, draw_height)
    return draw_x, draw_y, draw_width, draw_height


def verify_single_page(path):
    if len(PdfReader(str(path)).pages) != 1:
        raise RuntimeError(f"{path.name} must contain exactly one page")
    return path


def export_site_map_png(chrome):
    html_path = DIST / "site-map.html"
    if not html_path.exists():
        raise FileNotFoundError(f"Run npm run build first: {html_path} is missing")
    SITE_MAP_PNG.unlink(missing_ok=True)
    if isinstance(chrome, Firefox):
        chrome.screenshot(html_path, SITE_MAP_PNG, 2, "#static")
    else:
        run_browser(chrome, ["--hide-scrollbars", "--force-device-scale-factor=2", "--window-size=1400,1260", f"--screenshot={SITE_MAP_PNG}", html_path.as_uri() + "#static"], "chrome-site-map-png")
    wait_for_file(SITE_MAP_PNG)
    with Image.open(SITE_MAP_PNG) as image:
        if image.size != (2800, 2520):
            raise RuntimeError(f"{SITE_MAP_PNG.name} is {image.size}, expected (2800, 2520)")
        if image.getbbox() is None:
            raise RuntimeError(f"{SITE_MAP_PNG.name} is blank")
    return SITE_MAP_PNG


def export_site_map_page(site_map_png):
    output = TMP_PDF / "site-top-down-map.pdf"
    page_width, page_height = A3
    pdf = canvas.Canvas(str(output), pagesize=(page_width, page_height), pageCompression=1)
    pdf.setTitle("Example site top-down placement map")
    pdf.setAuthor("A-frame drawing template")
    draw_page_frame(pdf, page_width, page_height)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(36, page_height - 42, "EXAMPLE SITE - TOP-DOWN PLACEMENT / OVERSIKTSKART")
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(page_width - 36, page_height - 40, "DRAWING S1 - DRAFT / UTKAST")
    pdf.drawString(36, page_height - 58, "Invented example layout drawn from the site model: structures, zones, perimeter and the four gates.")
    draw_image_contain(pdf, site_map_png, 36, 92, page_width - 72, page_height - 174)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(36, 54, "SCHEMATIC EXAMPLE - not surveyed; metres from the centre of the Hall.")
    pdf.drawRightString(page_width - 36, 54, "SOURCE: src/site-model.mjs")
    pdf.showPage(); pdf.save()
    return verify_single_page(output)


def export_specification_register_page():
    if not DRAWING_SUMMARY.exists():
        raise FileNotFoundError(f"Run npm run build first: {DRAWING_SUMMARY} is missing")
    records = json.loads(DRAWING_SUMMARY.read_text(encoding="utf-8"))
    output = TMP_PDF / "drawing-specification-register.pdf"
    page_width, page_height = A3
    pdf = canvas.Canvas(str(output), pagesize=(page_width, page_height), pageCompression=1)
    pdf.setTitle("A-frame drawing specification register"); pdf.setAuthor("A-frame drawing template")
    draw_page_frame(pdf, page_width, page_height)
    margin = 36
    pdf.setFont("Helvetica-Bold", 18); pdf.drawString(margin, page_height - 42, "DRAWING REGISTER - DIMENSIONS AND LABELS / MAL OG BETEGNELSER")
    pdf.setFont("Helvetica", 9); pdf.drawString(margin, page_height - 60, "Single cross-check page generated from the same source specifications as the full-page drawings.")
    pdf.drawRightString(page_width - margin, page_height - 42, "REGISTER R1 - DRAFT")
    table_x, table_top = margin, page_height - 105
    widths = [88, 84, 78, 90, 70, 70, 70, 68, 72]
    headers = ["BUILDING", "DRAWING", "CLOSED X", "EXT. / TOTAL X", "Y WIDTH", "Z HEIGHT", "FRAMES / BAYS", "ANCHORS", "DOOR SETS"]
    row_height = 62
    x = table_x
    pdf.setFillColorRGB(0.92, 0.93, 0.94); pdf.rect(table_x, table_top - 35, sum(widths), 35, fill=1, stroke=1); pdf.setFillColorRGB(0, 0, 0)
    for header, width in zip(headers, widths):
        pdf.setFont("Helvetica-Bold", 7); pdf.drawCentredString(x + width / 2, table_top - 21, header); pdf.line(x, table_top, x, table_top - 35 - row_height * len(records)); x += width
    pdf.line(x, table_top, x, table_top - 35 - row_height * len(records)); pdf.line(table_x, table_top, table_x + sum(widths), table_top); pdf.line(table_x, table_top - 35, table_x + sum(widths), table_top - 35)
    for index, record in enumerate(records):
        row_top = table_top - 35 - index * row_height; row_bottom = row_top - row_height
        values = [record["name"], f'{record["drawingNumber"]}\n{record["revision"]}', mm_text(record["dimensions"]["closedLengthMm"]), f'{mm_text(record["dimensions"]["extensionLengthMm"])} /\n{mm_text(record["dimensions"]["totalLengthMm"])}', mm_text(record["dimensions"]["widthMm"]), mm_text(record["dimensions"]["heightMm"]), f'{record["structure"]["stations"]} / {record["structure"]["bays"]}', str(record["foundation"]["anchorCount"]), f'{record["doors"]["totalShownSets"]}\n(E/S/I {record["doors"]["endGableSets"]}/{record["doors"]["exteriorSideSets"]}/{record["doors"]["internalSets"]})']
        x = table_x
        for value, width in zip(values, widths):
            pdf.setFont("Helvetica-Bold" if width == widths[0] else "Helvetica", 8)
            for line_index, line in enumerate(str(value).split("\n")): pdf.drawCentredString(x + width / 2, row_top - 23 - line_index * 12, line)
            x += width
        pdf.line(table_x, row_bottom, table_x + sum(widths), row_bottom)
    panel_top = table_top - 35 - row_height * len(records) - 32
    pdf.rect(margin, panel_top - 180, 360, 180); pdf.rect(margin + 378, panel_top - 180, page_width - margin * 2 - 378, 180)
    pdf.setFont("Helvetica-Bold", 11); pdf.drawString(margin + 12, panel_top - 22, "AXES / AKSER")
    pdf.setFont("Helvetica", 9); y = panel_top - 45
    for line in ["X - length along the building / lengde langs bygget", "Y - width across the A-frame / bredde på tvers", "Z - height above foundation level / høyde over fundament", "Coordinates refer to anchor centres unless noted otherwise."]:
        pdf.drawString(margin + 12, y, line); y -= 24
    right_x = margin + 390; pdf.setFont("Helvetica-Bold", 11); pdf.drawString(right_x, panel_top - 22, "LABELS AND SYMBOLS / BETEGNELSER")
    pdf.setFont("Helvetica", 8.5); y = panel_top - 45
    for line in ["B1...B8 - closed-shell concrete anchor centres", "L1/L2 - Hall extension anchor lines", "Black dot - structural joint; grey block - concrete anchor", "Optional emergency-door layer - omitted from this review issue", "Steel wire - solid near wall / dashed far wall", "Door sets: E=end gable, S=exterior long side, I=internal opposing pair"]:
        pdf.drawString(right_x, y, line); y -= 21
    register_y = panel_top - 225; pdf.setFont("Helvetica-Bold", 11); pdf.drawString(margin, register_y, "PACKAGE ORDER / DOKUMENTREKKEFOLGE"); pdf.setFont("Helvetica", 8.5); y = register_y - 24
    for line in ["1-4 Full-page building drawings: Hall, Shell 6, Shell 6D, Shell 8", "5 Site top-down placement map", "6 This dimensions and labels register", "7-10 Per-building coordinates and top-down construction layer states", "11 onward: each other building form, then the same sheet with its technical audit layer"]:
        pdf.drawString(margin + 12, y, line); y -= 21
    # The other building forms, from the summary the build writes.
    forms = json.loads(FORM_SUMMARY.read_text(encoding="utf-8")) if FORM_SUMMARY.exists() else []
    if forms:
        form_top = y - 26
        pdf.setFont("Helvetica-Bold", 11); pdf.drawString(margin, form_top, "OTHER BUILDING FORMS / ANDRE BYGGFORMER")
        columns = [("BUILDING", 0), ("FORM", 130), ("X LENGTH", 230), ("Y WIDTH", 310), ("Z HEIGHT", 390), ("FLOOR AREA", 470), ("AUDIT CHECKS", 560)]
        pdf.setFont("Helvetica-Bold", 7)
        for title, offset in columns: pdf.drawString(margin + 12 + offset, form_top - 20, title)
        pdf.line(margin, form_top - 25, page_width - margin, form_top - 25)
        pdf.setFont("Helvetica", 8.5)
        for index, form in enumerate(forms):
            row_y = form_top - 40 - index * 15
            cells = [form["name"], form["form"], mm_text(form["lengthMm"]), mm_text(form["widthMm"]), mm_text(form["heightMm"]), f'{form["areaM2"]:.1f} m2', f'{form["checks"]} pass']
            for (title, offset), cell in zip(columns, cells): pdf.drawString(margin + 12 + offset, row_y, str(cell))
    pdf.setFont("Helvetica-Bold", 9); pdf.drawString(margin, 86, "STATUS / STATUS"); pdf.setFont("Helvetica", 8.5)
    draw_wrapped(pdf, "All dimensions and labels are examples and remain provisional until verified on site.", margin + 100, 86, page_width - margin * 2 - 100, size=8.5, leading=12)
    pdf.setFont("Helvetica", 8); pdf.drawString(margin, 48, "SOURCE OF TRUTH: data-driven building specifications and generated foundation schedules."); pdf.drawRightString(page_width - margin, 48, "A-FRAME DRAWING PACKAGE - SPECIFICATION REGISTER")
    pdf.showPage(); pdf.save()
    return verify_single_page(output)


def merge_pdf_pages(
    main_pages: list[Path],
    site_map_page: Path,
    specification_page: Path,
    checkpoint_pages: list[Path],
    form_pages: list[Path],
) -> Path:
    output = PDF_DIR / "a-frame-buildings.pdf"
    ordered_pages = [
        *main_pages,
        site_map_page,
        specification_page,
        *checkpoint_pages,
        *form_pages,
    ]
    writer = PdfWriter()
    for page_path in ordered_pages:
        reader = PdfReader(str(page_path))
        writer.add_page(reader.pages[0])
    writer.add_metadata(
        {
            "/Title": "A-frame example buildings - coordinated drawing set",
            "/Subject": "Full-page drawings, site map, specification register and checkpoints",
            "/Creator": "A-frame drawing template",
        }
    )
    with output.open("wb") as stream:
        writer.write(stream)
    if len(PdfReader(str(output)).pages) != len(ordered_pages):
        raise RuntimeError("Combined PDF page count is incorrect")
    return output


def merge_pdf_pages_without_overview(
    main_pages: list[Path],
    specification_page: Path,
    checkpoint_pages: list[Path],
) -> Path:
    output = PDF_DIR / "a-frame-buildings-no-overview.pdf"
    ordered_pages = [
        *main_pages,
        specification_page,
        *checkpoint_pages,
    ]
    writer = PdfWriter()
    for page_path in ordered_pages:
        reader = PdfReader(str(page_path))
        writer.add_page(reader.pages[0])
    writer.add_metadata(
        {
            "/Title": "A-frame buildings - reviewer set without site overview",
            "/Subject": "Full-page drawings, specification register and checkpoints; site overview omitted",
            "/Creator": "A-frame drawing template",
        }
    )
    with output.open("wb") as stream:
        writer.write(stream)
    if len(PdfReader(str(output)).pages) != len(ordered_pages):
        raise RuntimeError("No-overview PDF page count is incorrect")
    return output

def export_building_pdf(building: str, main_page: Path, checkpoint_page: Path) -> Path:
    output = PDF_DIR / f"{building}.pdf"
    writer = PdfWriter()
    for page_path in (main_page, checkpoint_page):
        reader = PdfReader(str(page_path))
        writer.add_page(reader.pages[0])
    writer.add_metadata(
        {
            "/Title": f"A-frame {building.title()} - coordinated drawing and checkpoint",
            "/Subject": "Page 1 coordinated drawing; page 2 dimensions, coordinates and construction layer states",
            "/Creator": "A-frame drawing template",
        }
    )
    with output.open("wb") as stream:
        writer.write(stream)
    if len(PdfReader(str(output)).pages) != 2:
        raise RuntimeError(f"{output.name} must contain exactly two pages")
    return output


def main() -> None:
    args = parse_args()
    selected = tuple(dict.fromkeys(args.building or BUILDINGS + FORMS))
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    TMP_PDF.mkdir(parents=True, exist_ok=True)
    chrome = find_browser(args.browser)
    try:
        export_all(args, selected, chrome)
    finally:
        if isinstance(chrome, Firefox):
            chrome.close()


def export_all(args, selected, chrome) -> None:
    if args.checkpoint_only:
        for building in selected:
            checkpoint_path = DIST / f"{building}-checkpoint.html"
            existing_pdf = PDF_DIR / f"{building}.pdf"
            if not checkpoint_path.exists():
                raise FileNotFoundError(f"Run npm run build first: {checkpoint_path} is missing")
            if not existing_pdf.exists():
                raise FileNotFoundError(f"A full export is required before checkpoint-only mode: {existing_pdf} is missing")
            verify_checkpoint_labels(checkpoint_path)
            cached_main = TMP_PDF / f"{building}-existing.pdf"
            shutil.copy2(existing_pdf, cached_main)
            checkpoint_page = export_pdf_page(chrome, f"{building}-checkpoint", checkpoint_path)
            building_pdf = export_building_pdf(building, cached_main, checkpoint_page)
            print(f"Updated {building_pdf.relative_to(ROOT)} page 2")
        return

    pdf_pages: list[Path] = []
    form_pages: list[Path] = []
    checkpoint_pages: list[Path] = []
    for building in selected:
        html_path = DIST / f"{building}.html"
        checkpoint_path = DIST / f"{building}-checkpoint.html"
        if not html_path.exists():
            raise FileNotFoundError(f"Run npm run build first: {html_path} is missing")
        if building in BUILDINGS:
            if not checkpoint_path.exists():
                raise FileNotFoundError(f"Run npm run build first: {checkpoint_path} is missing")
            verify_labels(html_path)
            verify_checkpoint_labels(checkpoint_path)
        if building in FORMS:
            verify_form_sheet(html_path)
            png = export_png(chrome, building, html_path, "#static")
            main_page = export_pdf_page(chrome, f"{building}-main", html_path, "#static")
            audit_page = export_pdf_page(chrome, f"{building}-audit", html_path, "#audit")
            form_pages.extend([main_page, audit_page])
            building_pdf = export_building_pdf(building, main_page, audit_page)
            print(f"Exported {png.relative_to(ROOT)}")
            print(f"Exported {building_pdf.relative_to(ROOT)} (2 pages)")
            continue
        png = export_png(chrome, building, html_path)
        main_page = export_pdf_page(chrome, f"{building}-main", html_path)
        checkpoint_page = export_pdf_page(chrome, f"{building}-checkpoint", checkpoint_path)
        pdf_pages.append(main_page)
        checkpoint_pages.append(checkpoint_page)
        building_pdf = export_building_pdf(building, main_page, checkpoint_page)
        print(f"Exported {png.relative_to(ROOT)}")
        print(f"Exported {building_pdf.relative_to(ROOT)} (2 pages)")
    if selected == BUILDINGS + FORMS:
        site_map_png = export_site_map_png(chrome)
        site_map_page = export_site_map_page(site_map_png)
        specification_page = export_specification_register_page()
        combined = merge_pdf_pages(
            pdf_pages,
            site_map_page,
            specification_page,
            checkpoint_pages,
            form_pages,
        )
        no_overview = merge_pdf_pages_without_overview(
            pdf_pages,
            specification_page,
            checkpoint_pages,
        )
        page_count = len(PdfReader(str(combined)).pages)
        no_overview_page_count = len(PdfReader(str(no_overview)).pages)
        print(f"Exported {site_map_png.relative_to(ROOT)}")
        print(f"Exported {combined.relative_to(ROOT)} ({page_count} pages)")
        print(f"Exported {no_overview.relative_to(ROOT)} ({no_overview_page_count} pages)")


if __name__ == "__main__":
    main()
