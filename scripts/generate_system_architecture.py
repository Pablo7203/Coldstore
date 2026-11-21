from __future__ import annotations

from html import escape
from pathlib import Path


OUT = Path(__file__).resolve().parents[1] / "docs" / "architecture"
W, H = 1920, 1320
INK = "#24372F"
GREEN = "#3E6B54"
GREEN_PALE = "#E7F0E9"
BLUE = "#3F748A"
BLUE_PALE = "#EAF2F6"
GOLD = "#A97522"
GOLD_PALE = "#FBF2DD"
PURPLE = "#75628F"
PURPLE_PALE = "#F0ECF6"
LINE = "#D3DCD5"
MUTED = "#65736B"
PAPER = "#FBFAF6"
FONT = "Arial, Helvetica, sans-serif"


def box(x: int, y: int, w: int, h: int, title: str, subtitle: str = "", fill: str = "#ffffff",
        stroke: str = LINE, title_size: int = 18, subtitle_size: int = 13) -> list[str]:
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="15" fill="{fill}" stroke="{stroke}" stroke-width="2"/>']
    out.append(f'<text x="{x + w / 2}" y="{y + h / 2 - (4 if subtitle else -6)}" text-anchor="middle" class="box-title" font-size="{title_size}">{escape(title)}</text>')
    if subtitle:
        out.append(f'<text x="{x + w / 2}" y="{y + h / 2 + 19}" text-anchor="middle" class="box-subtitle" font-size="{subtitle_size}">{escape(subtitle)}</text>')
    return out


def arrow(x1: int, y1: int, x2: int, y2: int, color: str = GREEN, dash: bool = False,
          marker: str = "arrow") -> str:
    dash_attr = ' stroke-dasharray="9 7"' if dash else ""
    return f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="3"{dash_attr} marker-end="url(#{marker})"/>'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    s = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        '<title>Figure 5.2: System Architecture</title>',
        '<desc>Three-layer architecture for the Grand Pa’s Cold Store Management System, with a separate PWA offline data path and Paystack connected to online payments.</desc>',
        f'<style>text{{font-family:{FONT}}}.title{{font-size:36px;font-weight:700;fill:{INK}}}.subtitle{{font-size:18px;fill:{MUTED}}}.layer-label{{font-size:17px;font-weight:700;letter-spacing:1.2px;fill:{INK}}}.box-title{{font-weight:700;fill:{INK}}}.box-subtitle{{fill:{MUTED}}}.small{{font-size:14px;fill:{MUTED}}}.flow{{font-size:14px;font-weight:600;fill:{MUTED}}}.tag{{font-size:13px;font-weight:700;letter-spacing:.9px}}</style>',
        '<defs>',
        '<marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10Z" fill="' + GREEN + '"/></marker>',
        '<marker id="arrow-blue" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10Z" fill="' + BLUE + '"/></marker>',
        '<marker id="arrow-gold" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10Z" fill="' + GOLD + '"/></marker>',
        '<marker id="arrow-purple" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10Z" fill="' + PURPLE + '"/></marker>',
        '<pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#e8e7df" stroke-width="1"/></pattern>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="{PAPER}"/>',
        f'<rect width="{W}" height="{H}" fill="url(#grid)" opacity=".35"/>',
        '<text x="92" y="78" class="title">System Architecture</text>',
        '<text x="94" y="114" class="subtitle">Grand Pa’s Cold Store Management System · layered web application with offline-capable POS workflows</text>',
        # Layer containers
        '<rect x="80" y="160" width="1760" height="250" rx="24" fill="#ffffff" stroke="#aab8af" stroke-width="2"/>',
        '<rect x="80" y="435" width="1760" height="445" rx="24" fill="#ffffff" stroke="#aab8af" stroke-width="2"/>',
        '<rect x="80" y="905" width="1760" height="220" rx="24" fill="#ffffff" stroke="#aab8af" stroke-width="2"/>',
        '<text x="112" y="194" class="layer-label">PRESENTATION LAYER</text>',
        '<text x="112" y="469" class="layer-label">APPLICATION LAYER</text>',
        '<text x="112" y="939" class="layer-label">DATA LAYER</text>',
        # Presentation layer screens
        *box(150, 238, 290, 116, "Customer Web Interface", "Browse · cart · checkout", GREEN_PALE, GREEN),
        *box(485, 238, 260, 116, "POS Interface", "Sales · payments · receipt", GREEN_PALE, GREEN),
        *box(790, 238, 280, 116, "Manager Dashboard", "Operations · orders · credit", GREEN_PALE, GREEN),
        *box(1115, 238, 280, 116, "Administrator Dashboard", "Staff · roles · oversight", GREEN_PALE, GREEN, 17),
        *box(1440, 238, 290, 116, "Stock Interface", "Inventory · movements", GREEN_PALE, GREEN),
        # Application core and service boxes
        *box(175, 515, 350, 110, "Next.js Application", "Web routes · server actions · API", BLUE_PALE, BLUE, 21),
        *box(590, 515, 350, 110, "Authentication & Authorisation", "Supabase Auth · role permissions", BLUE_PALE, BLUE, 19),
        *box(1005, 515, 330, 110, "POS Service", "Sale processing · receipt data", BLUE_PALE, BLUE),
        *box(1390, 515, 360, 110, "Inventory Service", "Stock movements · availability", BLUE_PALE, BLUE),
        *box(175, 690, 350, 110, "Order & Reservation Service", "Customer pickup · stock reservation", BLUE_PALE, BLUE, 19),
        *box(590, 690, 350, 110, "Credit Service", "Accounts · limits · repayments", BLUE_PALE, BLUE),
        *box(1005, 690, 330, 110, "Synchronisation Service", "Reconcile queued offline work", PURPLE_PALE, PURPLE),
        *box(1390, 690, 360, 110, "Reporting Service", "Operational views and summaries", BLUE_PALE, BLUE),
        # Data layer
        *box(230, 987, 500, 100, "Supabase PostgreSQL", "Products · inventory · sales · orders · credit", BLUE_PALE, BLUE, 21),
        *box(820, 987, 400, 100, "Supabase Authentication", "User identity and sessions", GREEN_PALE, GREEN, 20),
        *box(1310, 987, 420, 100, "Row Level Security", "Policies enforced on PostgreSQL", GOLD_PALE, GOLD, 21),
        # Presentation screens enter through the relevant application component.
        arrow(350, 354, 350, 515, BLUE, marker="arrow-blue"),
        arrow(615, 354, 1145, 515, BLUE, marker="arrow-blue"),
        arrow(930, 354, 350, 690, BLUE, marker="arrow-blue"),
        arrow(1255, 354, 765, 515, BLUE, marker="arrow-blue"),
        arrow(1585, 354, 1570, 515, BLUE, marker="arrow-blue"),
        # Services share the application and persist operational records in PostgreSQL.
        '<path d="M960 880 V958 H480 V987" fill="none" stroke="' + BLUE + '" stroke-width="3" marker-end="url(#arrow-blue)"/>',
        '<text x="500" y="950" class="flow">application data</text>',
        # Identity and access control relationships.
        '<path d="M940 570 H970 V958 H1020 V987" fill="none" stroke="' + GREEN + '" stroke-width="3" stroke-dasharray="9 7" marker-end="url(#arrow)"/>',
        # PWA/offline architecture, separated as requested
        '<rect x="175" y="1155" width="1120" height="105" rx="20" fill="' + PURPLE_PALE + '" stroke="' + PURPLE + '" stroke-width="2.3"/>',
        '<text x="205" y="1185" class="tag" fill="' + PURPLE + '">PWA / OFFLINE POS PATH</text>',
        *box(205, 1195, 260, 52, "PWA / Service Worker", "", "#ffffff", PURPLE, 15),
        *box(555, 1195, 260, 52, "IndexedDB / Dexie", "", "#ffffff", PURPLE, 15),
        *box(905, 1195, 345, 52, "Synchronisation Service", "", "#ffffff", PURPLE, 15),
        '<path d="M465 1221 L555 1221" fill="none" stroke="' + PURPLE + '" stroke-width="3" marker-end="url(#arrow-purple)"/>',
        '<path d="M815 1221 L905 1221" fill="none" stroke="' + PURPLE + '" stroke-width="3" marker-end="url(#arrow-purple)"/>',
        '<path d="M1080 1195 C1080 1110 1170 1002 1170 800" fill="none" stroke="' + PURPLE + '" stroke-width="3" stroke-dasharray="9 7" marker-end="url(#arrow-purple)"/>',
        # Paystack only in online payment path
        '<rect x="1450" y="1155" width="340" height="105" rx="20" fill="' + GOLD_PALE + '" stroke="' + GOLD + '" stroke-width="2.3"/>',
        '<text x="1480" y="1185" class="tag" fill="' + GOLD + '">ONLINE PAYMENT ONLY</text>',
        *box(1500, 1195, 250, 52, "Paystack", "", "#ffffff", GOLD, 17),
        '<path d="M525 615 V650 H1805 V1221 H1750" fill="none" stroke="' + GOLD + '" stroke-width="3" stroke-dasharray="9 7" marker-end="url(#arrow-gold)"/>',
        '<text x="1510" y="642" class="flow" fill="' + GOLD + '">online checkout payment only</text>',
        # Caption
        '<text x="92" y="1295" font-family="' + FONT + '" font-size="21" font-weight="500" fill="' + MUTED + '">Figure 5.2: System Architecture</text>',
        '</svg>',
    ]
    (OUT / "figure-5-2-system-architecture.svg").write_text("\n".join(s), encoding="utf-8")
    (OUT / "README.md").write_text(
        "# System architecture figure\n\n"
        "Figure 5.2 presents the presentation, application and data layers, a separate PWA / IndexedDB / synchronisation path, and Paystack on the online payment path.\n\n"
        "Regenerate with `python scripts/generate_system_architecture.py`.\n",
        encoding="utf-8",
    )
    print(f"Created system architecture figure in {OUT}")


if __name__ == "__main__":
    main()
