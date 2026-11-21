from __future__ import annotations

from html import escape
from pathlib import Path


OUT = Path(__file__).resolve().parents[1] / "docs" / "use-case-diagrams"
WIDTH = 1500
ROW_GAP = 78
OVAL_X = 675
OVAL_W = 665
BOUNDARY_X = 630
BOUNDARY_W = 760
FONT = "Arial, Helvetica, sans-serif"


DIAGRAMS = [
    (
        "Administrator",
        "Admin",
        [
            "Manage staff accounts and assign roles",
            "Manage products and categories",
            "View stock and record inventory movements",
            "Review stock movement and audit history",
            "Search, create, and update customer records",
            "Complete point-of-sale sales",
            "View all sales history and receipts",
            "Manage customer pickup orders",
            "Manage customer credit limits and account status",
        ],
    ),
    (
        "Manager",
        "Manager",
        [
            "Manage products and categories",
            "View stock and record inventory movements",
            "Review stock movement history",
            "Search, create, and update customer records",
            "Complete point-of-sale sales",
            "View all sales history and receipts",
            "View customer credit balances and history",
            "Manage credit limits and record repayments",
            "Manage pickup orders and confirm collection",
        ],
    ),
    (
        "Cashier",
        "Cashier",
        [
            "Search products and check stock availability",
            "Search customer records and create walk-in customers",
            "Complete point-of-sale sales",
            "View own sales history and reprint receipts",
            "View customer credit balances and history",
            "Record customer credit repayments",
            "Manage pickup orders and confirm cash collection",
        ],
    ),
    (
        "Stock Assistant",
        "Stock Assistant",
        [
            "View product catalogue and stock levels",
            "Record stock receipts",
            "Record wastage and damaged stock",
            "Make reasoned stock adjustments",
            "Review stock movement history",
        ],
    ),
    (
        "Customer",
        "Customer",
        [
            "Register and sign in to a customer account",
            "Browse, search, and filter products",
            "Add products to and update the shopping cart",
            "Place a pickup order and reserve available stock",
            "Pay cash when collecting the order",
            "View personal order history and status",
        ],
    ),
]


def stick_figure(cx: int, cy: int, actor: str) -> list[str]:
    return [
        f'<circle cx="{cx}" cy="{cy - 148}" r="43" fill="#ffffff" stroke="#222222" stroke-width="2.2"/>',
        f'<line x1="{cx}" y1="{cy - 105}" x2="{cx}" y2="{cy + 35}" stroke="#222222" stroke-width="2.2"/>',
        f'<line x1="{cx - 78}" y1="{cy - 55}" x2="{cx + 78}" y2="{cy - 55}" stroke="#222222" stroke-width="2.2"/>',
        f'<line x1="{cx}" y1="{cy + 35}" x2="{cx - 75}" y2="{cy + 165}" stroke="#222222" stroke-width="2.2"/>',
        f'<line x1="{cx}" y1="{cy + 35}" x2="{cx + 75}" y2="{cy + 165}" stroke="#222222" stroke-width="2.2"/>',
        f'<text x="{cx}" y="{cy + 202}" text-anchor="middle" class="actor">{escape(actor)}</text>',
    ]


def render(title: str, actor: str, cases: list[str], index: int) -> str:
    top = 115
    boundary_y = 28
    boundary_h = top + ROW_GAP * len(cases) + 14
    caption_y = boundary_y + boundary_h + 44
    height = caption_y + 48
    cy = min(max(boundary_y + boundary_h / 2, 230), height - 280)

    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" viewBox="0 0 {WIDTH} {height}">',
        f'<title>Figure 5.{12 + index}: Use Case Diagram for the {escape(title)}</title>',
        '<desc>UML use-case diagram showing the functional requirements available to the ' + escape(title) + ' user role in Grand Pa’s Cold Store Management System.</desc>',
        f'<style>text{{font-family:{FONT}}}.system{{font-size:22px;font-weight:700;fill:#222}}.case{{font-size:18px;font-weight:600;fill:#222}}.actor{{font-size:23px;font-weight:700;fill:#222}}.caption{{font-size:21px;font-style:italic;fill:#233954}}</style>',
        '<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e4e4e4" stroke-width="1"/></pattern></defs>',
        f'<rect width="{WIDTH}" height="{height}" fill="#ffffff"/>',
        f'<rect x="8" y="8" width="{WIDTH - 16}" height="{caption_y - 5}" fill="url(#grid)"/>',
        f'<rect x="{BOUNDARY_X}" y="{boundary_y}" width="{BOUNDARY_W}" height="{boundary_h}" rx="76" fill="#ffffff" stroke="#333333" stroke-width="2.2"/>',
        f'<text x="{BOUNDARY_X + BOUNDARY_W / 2}" y="{boundary_y + 48}" text-anchor="middle" class="system">Grand Pa’s Cold Store Management System</text>',
    ]

    actor_cx = 220
    actor_link_x = 300
    actor_link_y = cy - 55
    for i, label in enumerate(cases):
        center_y = top + i * ROW_GAP + boundary_y
        elements.append(
            f'<line x1="{actor_link_x}" y1="{actor_link_y}" x2="{OVAL_X}" y2="{center_y}" stroke="#333333" stroke-width="1.7"/>'
        )

    for i, label in enumerate(cases):
        center_y = top + i * ROW_GAP + boundary_y
        elements.append(
            f'<ellipse cx="{OVAL_X + OVAL_W / 2}" cy="{center_y}" rx="{OVAL_W / 2}" ry="29" fill="#ffffff" stroke="#333333" stroke-width="1.8"/>'
        )
        elements.append(
            f'<text x="{OVAL_X + OVAL_W / 2}" y="{center_y + 6}" text-anchor="middle" class="case">{escape(label)}</text>'
        )

    elements.extend(stick_figure(actor_cx, int(cy), actor))
    elements.extend(
        [
            f'<text x="38" y="{caption_y + 26}" class="caption">Figure 5.{12 + index}: Use Case Diagram for the {escape(title)}</text>',
            "</svg>",
        ]
    )
    return "\n".join(elements)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for index, (title, actor, cases) in enumerate(DIAGRAMS, start=1):
        slug = title.lower().replace(" ", "-")
        svg = render(title, actor, cases, index)
        (OUT / f"use-case-{slug}.svg").write_text(svg, encoding="utf-8")
    print(f"Created five role-based use-case diagrams in {OUT}")


if __name__ == "__main__":
    main()
