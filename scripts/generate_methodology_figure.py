from __future__ import annotations

from html import escape
from pathlib import Path


OUT = Path(__file__).resolve().parents[1] / "docs" / "methodology"
W, H = 1920, 1280
INK = "#24372F"
GREEN = "#3E6B54"
GREEN_DARK = "#2F5140"
GREEN_PALE = "#E6F0E9"
BLUE = "#3F748A"
BLUE_PALE = "#EAF2F6"
GOLD = "#A97522"
GOLD_PALE = "#FBF2DD"
RED = "#B3544C"
PAPER = "#FBFAF6"
LINE = "#D4DDD6"
MUTED = "#65736B"
FONT = "Arial, Helvetica, sans-serif"


def txt(x: int, y: int, text: str, size: int = 20, weight: int = 400,
        color: str = INK, anchor: str = "start") -> str:
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{escape(text)}</text>')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    s = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        '<title>Figure 5.1: Iterative Development Approach for the Grand Pa’s Cold Store Management System</title>',
        '<desc>Diagram of an iterative DSDM development cycle, guided by MoSCoW priorities within a fixed academic timeframe.</desc>',
        '<defs>',
        '<marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" orient="auto"><path d="M0 0L10 5L0 10Z" fill="' + GREEN + '"/></marker>',
        '<marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" orient="auto"><path d="M0 0L10 5L0 10Z" fill="' + BLUE + '"/></marker>',
        '<pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#e8e7df" stroke-width="1"/></pattern>',
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="{PAPER}"/>',
        f'<rect width="{W}" height="{H}" fill="url(#grid)" opacity=".35"/>',
        txt(92, 82, "Grand Pa’s Cold Store Management System", 36, 700),
        txt(94, 119, "DSDM iterative development · Fixed academic timeframe · Progressive refinement", 19, 400, MUTED),
        # Cycle center and iterative arrows
        f'<circle cx="960" cy="640" r="145" fill="#fffefa" stroke="{LINE}" stroke-width="2"/>',
        txt(960, 616, "ITERATIVE", 24, 700, GREEN_DARK, "middle"),
        txt(960, 650, "development", 22, 600, INK, "middle"),
        txt(960, 684, "cycle", 22, 600, INK, "middle"),
        f'<path d="M1022 300 C1080 310 1095 385 1135 434" fill="none" stroke="{GREEN}" stroke-width="5" marker-end="url(#arrow-green)"/>',
        f'<path d="M1317 584 C1395 660 1380 758 1280 834" fill="none" stroke="{GREEN}" stroke-width="5" marker-end="url(#arrow-green)"/>',
        f'<path d="M902 910 C840 900 820 826 808 730" fill="none" stroke="{GREEN}" stroke-width="5" marker-end="url(#arrow-green)"/>',
        f'<path d="M603 648 C528 536 540 374 623 300" fill="none" stroke="{GREEN}" stroke-width="5" marker-end="url(#arrow-green)"/>',
        # Cycle stage cards
        f'<rect x="622" y="224" width="400" height="152" rx="22" fill="{BLUE_PALE}" stroke="{BLUE}" stroke-width="2.5"/>',
        txt(822, 267, "01", 16, 700, BLUE, "middle"),
        txt(822, 305, "Requirements analysis", 25, 700, INK, "middle"),
        txt(822, 338, "Identify business problems and", 17, 400, MUTED, "middle"),
        txt(822, 362, "prioritise requirements.", 17, 400, MUTED, "middle"),
        f'<rect x="1112" y="432" width="410" height="152" rx="22" fill="{GREEN_PALE}" stroke="{GREEN}" stroke-width="2.5"/>',
        txt(1317, 475, "02", 16, 700, GREEN, "middle"),
        txt(1317, 513, "Design", 25, 700, INK, "middle"),
        txt(1317, 546, "Architecture · database · roles", 17, 400, MUTED, "middle"),
        txt(1317, 570, "interfaces · behavioural models", 17, 400, MUTED, "middle"),
        f'<rect x="902" y="834" width="410" height="152" rx="22" fill="{GOLD_PALE}" stroke="{GOLD}" stroke-width="2.5"/>',
        txt(1107, 877, "03", 16, 700, GOLD, "middle"),
        txt(1107, 915, "Incremental implementation", 24, 700, INK, "middle"),
        txt(1107, 948, "Build prioritised functions in manageable", 16, 400, MUTED, "middle"),
        txt(1107, 972, "stages, then refine them.", 16, 400, MUTED, "middle"),
        f'<rect x="398" y="648" width="410" height="152" rx="22" fill="#F1EEE7" stroke="#95815E" stroke-width="2.5"/>',
        txt(603, 691, "04", 16, 700, GOLD, "middle"),
        txt(603, 729, "Testing and refinement", 24, 700, INK, "middle"),
        txt(603, 762, "Verify functions and interactions;", 17, 400, MUTED, "middle"),
        txt(603, 786, "feed findings into the next cycle.", 17, 400, MUTED, "middle"),
        # Project selection / timebox card
        f'<rect x="85" y="198" width="420" height="380" rx="24" fill="#ffffff" stroke="{GREEN}" stroke-width="2.5"/>',
        f'<rect x="85" y="198" width="420" height="62" rx="24" fill="{GREEN_DARK}"/>',
        f'<rect x="85" y="234" width="420" height="26" fill="{GREEN_DARK}"/>',
        txt(120, 238, "PROJECT GUIDANCE", 17, 700, "#ffffff"),
        txt(120, 300, "MoSCoW priorities", 25, 700, INK),
        f'<rect x="120" y="323" width="108" height="35" rx="17" fill="{GREEN_PALE}"/>',
        txt(174, 347, "MUST", 14, 700, GREEN_DARK, "middle"),
        txt(248, 347, "Core requirements first", 17, 600, INK),
        txt(120, 391, "SHOULD · COULD · WON’T", 14, 700, MUTED),
        txt(120, 416, "Secondary functions follow", 17, 400, INK),
        txt(120, 440, "within the available project time.", 17, 400, INK),
        f'<line x1="120" y1="468" x2="470" y2="468" stroke="{LINE}" stroke-width="1.5"/>',
        txt(120, 502, "Fixed academic timeframe", 19, 700, BLUE),
        txt(120, 530, "Each stage fits the deadline; scope is", 16, 400, MUTED),
        txt(120, 554, "prioritised and refined progressively.", 16, 400, MUTED),
        # Must-have requirement card
        f'<rect x="1435" y="634" width="400" height="380" rx="24" fill="#ffffff" stroke="{BLUE}" stroke-width="2.5"/>',
        f'<rect x="1435" y="634" width="400" height="62" rx="24" fill="{BLUE}"/>',
        f'<rect x="1435" y="670" width="400" height="26" fill="{BLUE}"/>',
        txt(1470, 674, "MUST HAVE · DEVELOP AND VERIFY", 16, 700, "#ffffff"),
        txt(1470, 739, "Core system functions", 24, 700, INK),
        txt(1470, 785, "• Authentication", 18, 500, INK),
        txt(1470, 823, "• Inventory management", 18, 500, INK),
        txt(1470, 861, "• Point-of-sale processing", 18, 500, INK),
        txt(1470, 899, "• Customer credit", 18, 500, INK),
        txt(1470, 937, "• Customer ordering", 18, 500, INK),
        txt(1470, 975, "• Offline transactions and sync", 18, 500, INK),
        # Prioritisation and feedback links
        f'<path d="M505 330 C548 311 582 301 622 300" fill="none" stroke="{BLUE}" stroke-width="3.5" stroke-dasharray="9 8" marker-end="url(#arrow-blue)"/>',
        f'<path d="M1435 812 C1390 830 1350 853 1312 875" fill="none" stroke="{BLUE}" stroke-width="3.5" stroke-dasharray="9 8" marker-end="url(#arrow-blue)"/>',
        f'<path d="M808 754 C696 660 594 565 505 520" fill="none" stroke="{BLUE}" stroke-width="3" stroke-dasharray="9 8" marker-end="url(#arrow-blue)"/>',
        txt(560, 286, "MoSCoW selects scope", 13, 600, BLUE, "middle"),
        txt(1375, 806, "Must Have scope", 13, 600, BLUE, "middle"),
        txt(714, 642, "learning informs reprioritisation", 14, 600, BLUE, "middle"),
        # Late-stage secondary work indicator
        f'<rect x="1435" y="1040" width="400" height="64" rx="18" fill="{PAPER}" stroke="{LINE}" stroke-width="1.7"/>',
        txt(1470, 1068, "SECONDARY FEATURES", 13, 700, MUTED),
        txt(1470, 1092, "Add when time and priority allow", 16, 500, INK),
        # Caption
        txt(92, 1190, "Figure 5.1: Iterative Development Approach for the Grand Pa’s Cold Store Management System", 21, 500, MUTED),
        '</svg>',
    ]
    (OUT / "figure-5-1-iterative-development-approach.svg").write_text("\n".join(s), encoding="utf-8")
    (OUT / "README.md").write_text(
        "# Methodology figure\n\n"
        "Figure 5.1 illustrates the DSDM-inspired iterative development cycle and project-specific MoSCoW priorities. The editable SVG is `figure-5-1-iterative-development-approach.svg`.\n\n"
        "Regenerate with `python scripts/generate_methodology_figure.py`.\n",
        encoding="utf-8",
    )
    print(f"Created methodology figure in {OUT}")


if __name__ == "__main__":
    main()
