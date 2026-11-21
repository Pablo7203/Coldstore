from __future__ import annotations

from html import escape
from pathlib import Path


OUT = Path(__file__).resolve().parents[1] / "docs" / "rich-picture"
W, H = 1900, 1240
INK = "#23352E"
GREEN = "#3D6753"
GREEN_PALE = "#E6F0E9"
BLUE = "#39728A"
BLUE_PALE = "#E8F2F6"
GOLD = "#B98025"
GOLD_PALE = "#FBF2DE"
RED = "#B55D55"
RED_PALE = "#F9ECE9"
PAPER = "#FBFAF6"
LINE = "#9AA69F"
MUTED = "#637169"
FONT = "Arial, Helvetica, sans-serif"


def person(cx: int, cy: int, name: str, sub: str, color: str = GREEN) -> list[str]:
    return [
        f'<circle cx="{cx}" cy="{cy - 35}" r="18" fill="#fff" stroke="{color}" stroke-width="4"/>',
        f'<path d="M{cx} {cy - 17} L{cx} {cy + 35} M{cx - 28} {cy + 3} L{cx} {cy - 3} L{cx + 28} {cy + 3} M{cx} {cy + 35} L{cx - 24} {cy + 70} M{cx} {cy + 35} L{cx + 24} {cy + 70}" fill="none" stroke="{color}" stroke-width="4" stroke-linecap="round"/>',
        f'<text x="{cx}" y="{cy + 101}" text-anchor="middle" class="person-title">{escape(name)}</text>',
        f'<text x="{cx}" y="{cy + 123}" text-anchor="middle" class="small muted">{escape(sub)}</text>',
    ]


def label(x: int, y: int, value: str, color: str = INK, size: int = 16) -> str:
    return f'<text x="{x}" y="{y}" text-anchor="middle" fill="{color}" class="flow-label" font-size="{size}">{escape(value)}</text>'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    p = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        '<title>Grand Pa’s Cold Store — Daily Operations Rich Picture</title>',
        '<desc>A rich picture of the cold store’s daily work: supplier deliveries, stock checks, customer purchases, POS payments, pickup orders, and management oversight. Potential pressure points are explicitly marked for validation.</desc>',
        f'<style>text{{font-family:{FONT}}}.title{{font-size:34px;font-weight:700;fill:{INK}}}.subtitle{{font-size:17px;fill:{MUTED}}}.boundary-title{{font-size:18px;font-weight:700;letter-spacing:1px;fill:{GREEN}}}.node-title{{font-size:20px;font-weight:700;fill:{INK}}}.body{{font-size:15px;fill:{INK}}}.small{{font-size:13px;fill:{INK}}}.muted{{fill:{MUTED}}}.person-title{{font-size:17px;font-weight:700;fill:{INK}}}.flow-label{{font-size:15px;font-weight:600;paint-order:stroke;stroke:{PAPER};stroke-width:8px;stroke-linejoin:round}}.tag{{font-size:12px;font-weight:700;letter-spacing:.8px}}</style>',
        '<defs>',
        '<marker id="arrow-goods" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="' + GREEN + '"/></marker>',
        '<marker id="arrow-info" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="' + BLUE + '"/></marker>',
        '<marker id="arrow-money" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="' + GOLD + '"/></marker>',
        '<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#e9e8e0" stroke-width="1"/></pattern>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="{PAPER}"/>',
        f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#grid)" opacity=".42"/>',
        '<text x="72" y="70" class="title">Grand Pa’s Cold Store</text>',
        '<text x="74" y="101" class="subtitle">A rich picture of the people, products, money and information moving through a typical trading day</text>',
        # Business boundary
        f'<rect x="188" y="145" width="1495" height="905" rx="34" fill="#fffefa" stroke="{GREEN}" stroke-width="3"/>',
        '<rect x="220" y="126" width="420" height="40" rx="20" fill="#fffefa"/>',
        '<text x="232" y="153" class="boundary-title">INSIDE THE COLD STORE</text>',
        '<text x="1636" y="153" text-anchor="end" class="small muted">daily operations</text>',
        # Main internal activity cards
        f'<rect x="760" y="194" width="450" height="145" rx="18" fill="{BLUE_PALE}" stroke="{BLUE}" stroke-width="2"/>',
        '<text x="790" y="227" class="tag" fill="' + BLUE + '">COORDINATION</text>',
        '<text x="790" y="258" class="node-title">Manager</text>',
        '<text x="790" y="286" class="body">Sets prices and oversees staff, stock, orders,</text>',
        '<text x="790" y="308" class="body">sales and customer-credit decisions.</text>',
        f'<rect x="288" y="353" width="424" height="155" rx="18" fill="{GREEN_PALE}" stroke="{GREEN}" stroke-width="2"/>',
        '<text x="316" y="386" class="tag" fill="' + GREEN + '">STOCK CONTROL</text>',
        '<text x="316" y="418" class="node-title">Stock assistant</text>',
        '<text x="316" y="447" class="body">Checks deliveries, counts goods and stores them.</text>',
        '<text x="316" y="472" class="body">Records receipts, wastage, damage and adjustments.</text>',
        f'<rect x="1060" y="421" width="360" height="150" rx="18" fill="{GREEN_PALE}" stroke="{GREEN}" stroke-width="2"/>',
        '<text x="1088" y="453" class="tag" fill="' + GREEN + '">IN-STORE SALES</text>',
        '<text x="1088" y="486" class="node-title">Cashier</text>',
        '<text x="1088" y="515" class="body">Looks up items, records quantity, takes payment,</text>',
        '<text x="1088" y="539" class="body">links a customer when needed and gives a receipt.</text>',
        f'<rect x="745" y="407" width="280" height="158" rx="16" fill="{BLUE_PALE}" stroke="{BLUE}" stroke-width="2"/>',
        '<text x="770" y="439" class="tag" fill="' + BLUE + '">BUSINESS RECORDS</text>',
        '<text x="770" y="472" class="node-title">Store ledger</text>',
        '<text x="770" y="500" class="small">Products · stock movements · customers</text>',
        '<text x="770" y="523" class="small">Sales · payments · orders · credit</text>',
        '<text x="770" y="547" class="small muted">Each change is recorded for follow-up.</text>',
        # Freezer and products
        f'<rect x="340" y="603" width="370" height="245" rx="16" fill="#f2f8fa" stroke="{BLUE}" stroke-width="2.5"/>',
        '<text x="366" y="639" class="tag" fill="' + BLUE + '">PHYSICAL STOCK</text>',
        '<text x="366" y="673" class="node-title">Freezer / stockroom</text>',
        f'<rect x="366" y="697" width="145" height="113" rx="8" fill="#fff" stroke="{BLUE}" stroke-width="2"/>',
        f'<rect x="528" y="697" width="155" height="113" rx="8" fill="#fff" stroke="{BLUE}" stroke-width="2"/>',
        '<line x1="438" y1="699" x2="438" y2="808" stroke="' + BLUE + '" stroke-width="2"/>',
        '<line x1="607" y1="699" x2="607" y2="808" stroke="' + BLUE + '" stroke-width="2"/>',
        '<line x1="373" y1="752" x2="504" y2="752" stroke="' + BLUE + '" stroke-width="1.5"/>',
        '<line x1="535" y1="752" x2="676" y2="752" stroke="' + BLUE + '" stroke-width="1.5"/>',
        '<text x="438" y="735" text-anchor="middle" class="small">Poultry</text>',
        '<text x="438" y="788" text-anchor="middle" class="small">Meat</text>',
        '<text x="607" y="735" text-anchor="middle" class="small">Fish</text>',
        '<text x="607" y="788" text-anchor="middle" class="small">Other frozen goods</text>',
        '<text x="366" y="833" class="small muted">Available quantity changes as goods move.</text>',
        # POS and records
        f'<rect x="1010" y="650" width="415" height="190" rx="16" fill="#fff" stroke="{BLUE}" stroke-width="2.5"/>',
        '<text x="1038" y="686" class="tag" fill="' + BLUE + '">SALES AND RECORDS</text>',
        '<text x="1038" y="720" class="node-title">Point of sale</text>',
        '<text x="1038" y="749" class="body">Product lookup · quantity · tender · receipt</text>',
        '<text x="1038" y="776" class="body">Sale updates stock and, for credit, the customer balance.</text>',
        f'<rect x="1038" y="794" width="345" height="29" rx="5" fill="{BLUE_PALE}" stroke="{BLUE}" stroke-width="1.2"/>',
        '<text x="1210" y="814" text-anchor="middle" class="small">sales · payments · stock · credit records</text>',
        # Online/pickup flow
        f'<rect x="743" y="873" width="335" height="112" rx="16" fill="{BLUE_PALE}" stroke="{BLUE}" stroke-width="2"/>',
        '<text x="770" y="906" class="tag" fill="' + BLUE + '">ONLINE SHOP</text>',
        '<text x="770" y="939" class="node-title">Pickup order</text>',
        '<text x="770" y="964" class="small">Customer reserves available items for collection.</text>',
        f'<rect x="1150" y="873" width="390" height="112" rx="16" fill="{GREEN_PALE}" stroke="{GREEN}" stroke-width="2"/>',
        '<text x="1177" y="906" class="tag" fill="' + GREEN + '">PICKUP AT THE STORE</text>',
        '<text x="1177" y="939" class="node-title">Prepare → mark ready → collect</text>',
        '<text x="1177" y="964" class="small">Cash is recorded when the customer collects.</text>',
        # Outside parties
        *person(91, 245, "SUPPLIER", "wholesaler / delivery", GOLD),
        '<rect x="42" y="455" width="98" height="48" rx="8" fill="' + GOLD_PALE + '" stroke="' + GOLD + '" stroke-width="2"/>',
        '<rect x="53" y="439" width="54" height="25" rx="4" fill="' + GOLD_PALE + '" stroke="' + GOLD + '" stroke-width="2"/>',
        '<circle cx="67" cy="507" r="9" fill="#fff" stroke="' + GOLD + '" stroke-width="3"/><circle cx="116" cy="507" r="9" fill="#fff" stroke="' + GOLD + '" stroke-width="3"/>',
        '<text x="90" y="484" text-anchor="middle" class="small">delivery</text>',
        *person(1792, 269, "ADMIN", "staff accounts · roles", BLUE),
        *person(1792, 600, "CUSTOMER", "walk-in or online", GREEN),
        # Flow paths, below labels/nodes
        f'<path d="M145 480 C195 480 220 430 286 430" fill="none" stroke="{GREEN}" stroke-width="4" marker-end="url(#arrow-goods)"/>',
        f'<path d="M500 510 C500 548 500 566 500 600" fill="none" stroke="{GREEN}" stroke-width="4" marker-end="url(#arrow-goods)"/>',
        f'<path d="M710 714 C820 705 902 713 1008 723" fill="none" stroke="{GREEN}" stroke-width="4" marker-end="url(#arrow-goods)"/>',
        f'<path d="M712 430 C724 430 732 445 745 455" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M780 339 C762 355 742 367 712 385" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M1688 292 C1515 188 1360 188 1210 230" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M1210 315 C1270 355 1298 385 1304 419" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M1240 572 C1240 603 1230 619 1224 648" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M1692 565 C1590 552 1510 540 1423 520" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M1692 611 C1585 610 1510 596 1423 562" fill="none" stroke="{GOLD}" stroke-width="4" marker-end="url(#arrow-money)"/>',
        f'<path d="M1422 480 C1518 462 1600 473 1693 525" fill="none" stroke="{GREEN}" stroke-width="4" marker-end="url(#arrow-goods)"/>',
        f'<path d="M1079 929 C1105 929 1123 929 1148 929" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M710 820 C840 855 1000 855 1150 873" fill="none" stroke="{GREEN}" stroke-width="3.5" marker-end="url(#arrow-goods)"/>',
        f'<path d="M1689 650 C1630 715 1590 800 1541 890" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        f'<path d="M1540 928 C1613 896 1660 830 1694 684" fill="none" stroke="{BLUE}" stroke-width="3.5" marker-end="url(#arrow-info)"/>',
        # Labels
        label(212, 408, "frozen goods + delivery note", GREEN, 12),
        label(548, 568, "check, count, store", GREEN, 13),
        label(856, 692, "picked / weighed items", GREEN, 13),
        label(872, 394, "record receipts · damage · wastage", BLUE, 12),
        label(785, 353, "reorder needs · stock priorities", BLUE, 12),
        label(1450, 196, "user access and role assignment", BLUE, 13),
        label(1318, 374, "price · credit · order decisions", BLUE, 13),
        label(1288, 622, "sale details and tender", BLUE, 13),
        label(1544, 543, "product choice · questions", BLUE, 13),
        label(1556, 603, "cash · mobile money · credit", GOLD, 13),
        label(1555, 462, "receipt + purchased goods", GREEN, 13),
        label(1600, 820, "place pickup order", BLUE, 13),
        label(1110, 862, "reserve + queue", BLUE, 13),
        label(925, 848, "pick reserved stock", GREEN, 13),
        label(1618, 856, "ready notice → collection", BLUE, 13),
        # Potential issues, explicitly framed as investigation points
        '<text x="220" y="1022" class="tag" fill="' + RED + '">POTENTIAL PRESSURE POINTS TO CHECK</text>',
        f'<rect x="520" y="997" width="330" height="42" rx="12" fill="{RED_PALE}" stroke="{RED}" stroke-width="1.5" stroke-dasharray="6 5"/>',
        '<text x="685" y="1024" text-anchor="middle" class="small" fill="' + RED + '">delivery delays · stock discrepancies</text>',
        f'<rect x="875" y="997" width="330" height="42" rx="12" fill="{RED_PALE}" stroke="{RED}" stroke-width="1.5" stroke-dasharray="6 5"/>',
        '<text x="1040" y="1024" text-anchor="middle" class="small" fill="' + RED + '">wastage · damaged frozen goods</text>',
        f'<rect x="1230" y="997" width="400" height="42" rx="12" fill="{RED_PALE}" stroke="{RED}" stroke-width="1.5" stroke-dasharray="6 5"/>',
        '<text x="1430" y="1024" text-anchor="middle" class="small" fill="' + RED + '">checkout queues · credit / collection disputes</text>',
        # Legend and caption
        f'<line x1="230" y1="1111" x2="300" y2="1111" stroke="{GREEN}" stroke-width="4" marker-end="url(#arrow-goods)"/><text x="312" y="1117" class="small">physical goods</text>',
        f'<line x1="495" y1="1111" x2="565" y2="1111" stroke="{BLUE}" stroke-width="4" marker-end="url(#arrow-info)"/><text x="577" y="1117" class="small">information / records</text>',
        f'<line x1="825" y1="1111" x2="895" y2="1111" stroke="{GOLD}" stroke-width="4" marker-end="url(#arrow-money)"/><text x="907" y="1117" class="small">money / payment</text>',
        f'<line x1="1137" y1="1111" x2="1207" y2="1111" stroke="{RED}" stroke-width="2" stroke-dasharray="7 6"/><text x="1219" y="1117" class="small">possible tension to validate</text>',
        '<text x="230" y="1188" class="subtitle">Figure 5.18: Rich Picture of Grand Pa’s Cold Store Daily Operations</text>',
        '</svg>',
    ]
    (OUT / "grand-pas-cold-store-rich-picture.svg").write_text("\n".join(p), encoding="utf-8")
    (OUT / "README.md").write_text(
        "# Grand Pa’s Cold Store Rich Picture\n\n"
        "`grand-pas-cold-store-rich-picture.svg` is an editable vector diagram of the business’s daily physical and information flows. Dashed red callouts are framed as potential pressure points to validate, not established facts. Supplier delivery details are inferred from the cold-store context.\n\n"
        "Regenerate with `python scripts/generate_rich_picture.py`.\n",
        encoding="utf-8",
    )
    print(f"Created rich picture in {OUT}")


if __name__ == "__main__":
    main()
