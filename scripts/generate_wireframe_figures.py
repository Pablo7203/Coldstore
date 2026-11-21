from __future__ import annotations

from html import escape
from pathlib import Path


OUT = Path(__file__).resolve().parents[1] / "docs" / "wireframes"
W, H = 1600, 1120
BG = "#F3F3F3"
WHITE = "#FFFFFF"
INK = "#222222"
GREEN = "#333333"
GREEN_2 = "#444444"
SOFT = "#E5E5E5"
SOFT_2 = "#F7F7F7"
LINE = "#888888"
MUTED = "#555555"
AMBER = "#D8D8D8"
AMBER_BG = "#EEEEEE"
RED = "#444444"
FONT = "Arial, Helvetica, sans-serif"


class Canvas:
    def __init__(self, title: str, figure: str, subtitle: str = "") -> None:
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
            f'<title>{escape(title)}</title>',
            f'<desc>{escape(subtitle)}</desc>',
            '<rect width="1600" height="1120" fill="#F3F3F3"/>',
            '<style>text{font-family:Arial,Helvetica,sans-serif} .shadow{filter:none}</style>',
        ]
        self.figure = figure

    def rect(self, x, y, w, h, fill=WHITE, stroke=LINE, r=14, sw=1.5, cls=""):
        cl = f' class="{cls}"' if cls else ""
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="0" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{cl}/>'
        )

    def line(self, x1, y1, x2, y2, color=LINE, sw=1.5, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"{d}/>'
        )

    def text(self, x, y, value, size=18, color=INK, weight=400, anchor="start", spacing=0):
        self.parts.append(
            f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" letter-spacing="{spacing}">{escape(str(value))}</text>'
        )

    def circle(self, cx, cy, r, fill, stroke="none", sw=0):
        self.parts.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
        )

    def brand(self, x=72, y=68, light=False, scale=1):
        mark = 42 * scale
        self.rect(x, y - 31 * scale, mark, mark, fill=WHITE, stroke=LINE, r=0, sw=1.5)
        self.text(x + mark / 2, y - 6 * scale, "LOGO", 8 * scale, MUTED, 400, "middle")
        self.text(x + mark + 14 * scale, y - 9 * scale, "Grand Pa’s", 21 * scale, INK, 700)
        self.text(x + mark + 14 * scale, y + 12 * scale, "COLD STORE", 10 * scale, MUTED, 700, spacing=1.8 * scale)

    def pill(self, x, y, label, fill=SOFT, color=GREEN, w=None, h=30, size=13):
        w = w or max(66, 18 + len(label) * size * 0.58)
        self.rect(x, y, w, h, fill, LINE, r=0, sw=1)
        self.text(x + w / 2, y + h / 2 + size * 0.34, label, size, color, 700, "middle")
        return w

    def button(self, x, y, w, label, primary=True, h=48, size=16):
        self.rect(x, y, w, h, WHITE, INK if primary else LINE, r=0, sw=1.5)
        self.text(x + w / 2, y + h / 2 + size * 0.34, label, size, INK, 600, "middle")

    def field(self, x, y, w, label, value="", placeholder=False, h=56):
        self.text(x, y, label, 14, MUTED, 700)
        self.rect(x, y + 10, w, h, WHITE, LINE, r=0)
        self.text(x + 16, y + 10 + h / 2 + 6, value or "Enter " + label.lower(), 15, MUTED if placeholder or not value else INK, 400)

    def caption(self, label):
        self.line(72, 1042, 1528, 1042, LINE, 1.4)
        self.text(72, 1081, self.figure, 15, GREEN_2, 700, spacing=0.8)
        self.text(190, 1081, label, 18, INK, 600)

    def header(self, title, eyebrow, role="Manager"):
        self.rect(0, 0, W, 132, WHITE, LINE, r=0)
        self.line(0, 131, W, 131)
        self.brand(72, 72)
        self.text(565, 68, title, 14, MUTED, 600)
        self.pill(1210, 48, role, SOFT, GREEN, w=126, h=38, size=14)
        self.rect(1354, 45, 44, 44, WHITE, LINE, r=0)
        self.text(1376, 73, "USER", 8, MUTED, 600, "middle")
        self.button(1420, 47, 112, "Sign out", False, h=40, size=14)

    def nav(self, active):
        items = ["Workspace", "POS", "Sales", "Customers", "Products", "Inventory", "Credit", "Orders"]
        x, y = 72, 151
        widths = {"Workspace": 124, "POS": 72, "Sales": 82, "Customers": 114, "Products": 100, "Inventory": 110, "Credit": 84, "Orders": 92}
        for item in items:
            w = widths[item]
            self.rect(x, y, w, 40, SOFT if item == active else WHITE, LINE, r=0)
            self.text(x + w / 2, y + 26, item, 14, INK, 500, "middle")
            x += w + 9

    def save(self, name):
        self.parts.append("</svg>")
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / name).write_text("\n".join(self.parts), encoding="utf-8")


def login():
    c = Canvas("Login Screen Wireframe", "Figure 5.8", "Staff and customer sign-in screen")
    c.rect(74, 54, 1452, 936, WHITE, LINE, r=0, sw=1.5)
    c.text(800, 115, "LOW-FIDELITY WIREFRAME · SIGN-IN", 13, MUTED, 600, "middle", 1)
    c.rect(124, 178, 1352, 740, SOFT_2, LINE, r=0)
    c.brand(164, 236, scale=0.9)
    c.text(164, 326, "Sign-in page", 30, INK, 600)
    c.text(164, 361, "Staff and customer access", 16, MUTED)
    c.rect(164, 399, 500, 440, WHITE, LINE, r=0)
    c.text(188, 436, "Store information / illustration area", 13, MUTED, 500)
    c.rect(188, 459, 452, 220, SOFT_2, LINE, r=0, sw=1, cls="placeholder")
    c.text(414, 573, "CONTENT PLACEHOLDER", 14, MUTED, 500, "middle", 0.8)
    c.text(188, 724, "Role-based access", 15, INK, 500)
    c.text(188, 756, "Supporting sign-in information", 13, MUTED)
    x = 724
    c.rect(x, 399, 700, 440, WHITE, LINE, r=0)
    c.text(x + 30, 445, "Sign in", 26, INK, 600)
    c.text(x + 30, 479, "Enter your account details to continue", 14, MUTED)
    c.field(x + 30, 520, 640, "Email address", "name@example.com", h=46)
    c.field(x + 30, 620, 640, "Password", "Password", placeholder=True, h=46)
    c.text(x + 670, 686, "Forgot password?", 13, INK, 500, "end")
    c.button(x + 30, 712, 640, "Sign in", True, h=48, size=15)
    c.text(x + 350, 798, "Create customer account", 13, MUTED, 500, "middle")
    c.text(800, 885, "Primary action · Form fields · Account recovery", 12, MUTED, 400, "middle")
    c.caption("Login Screen Wireframe")
    c.save("figure-5-8-login-wireframe.svg")


def dashboard():
    c = Canvas("Manager Dashboard Wireframe", "Figure 5.9", "Manager staff workspace home screen")
    c.header("Staff workspace", "Workspace", "Manager")
    c.nav("Workspace")
    c.text(72, 258, "STAFF WORKSPACE", 12, GREEN_2, 700, spacing=1.6)
    c.text(72, 302, "Welcome, Ama", 34, INK, 700)
    c.text(72, 333, "Your store operations at a glance.", 16, MUTED)
    c.pill(1292, 272, "ACTIVE ACCOUNT", WHITE, INK, w=190, h=36, size=13)
    # Access strip
    c.rect(72, 365, 1456, 112, WHITE, LINE, r=16)
    c.text(100, 401, "YOUR ACCESS", 12, MUTED, 700, spacing=1.3)
    c.text(100, 439, "Manager", 23, INK, 700)
    c.text(340, 405, "Product and stock tools are available according to your assigned permissions.", 15, MUTED)
    c.pill(1280, 403, "Role-based access", SOFT, GREEN, w=190, h=34, size=12)
    # Core workspace cards, matching live staff workspace actions.
    cards = [
        (72, "CUSTOMER PICKUP", "Online orders", "Prepare pickup orders and record cash when customers collect.", "View orders", WHITE),
        (566, "CATALOGUE", "Products & categories", "Search products and maintain category and price details.", "Manage catalogue", WHITE),
        (1060, "STOCK CONTROL", "Inventory", "Review stock status and record authorized movements.", "Open inventory", WHITE),
    ]
    for x, eyebrow, title, body, action, fill in cards:
        c.rect(x, 503, 468, 178, WHITE, LINE, r=16)
        c.rect(x + 24, 527, 48, 48, fill, LINE, r=0)
        c.text(x + 48, 556, "ICON", 8, MUTED, 400, "middle")
        c.text(x + 90, 547, eyebrow, 11, MUTED, 700, spacing=1.0)
        c.text(x + 24, 610, title, 23, INK, 700)
        c.text(x + 24, 638, body, 13, MUTED)
        c.text(x + 24, 663, action + "  →", 13, GREEN_2, 700)
    # Staff directory
    c.text(72, 737, "Staff directory", 22, INK, 700)
    c.text(72, 764, "Manage account status and assigned roles.", 14, MUTED)
    c.button(1360, 722, 168, "+ Add staff", False, h=44, size=14)
    c.rect(72, 788, 1456, 207, WHITE, LINE, r=14)
    c.rect(73, 789, 1454, 42, SOFT_2, "none", r=13)
    c.text(99, 816, "STAFF MEMBER", 11, MUTED, 700, spacing=0.8)
    c.text(645, 816, "PHONE", 11, MUTED, 700, spacing=0.8)
    c.text(925, 816, "ROLE", 11, MUTED, 700, spacing=0.8)
    c.text(1200, 816, "STATUS", 11, MUTED, 700, spacing=0.8)
    c.text(1430, 816, "ACTION", 11, MUTED, 700, "middle", 0.8)
    rows = [
        ("Kwame Mensah", "+233 24 555 0182", "Cashier", "Active"),
        ("Akosua Boateng", "+233 20 555 0134", "Stock assistant", "Active"),
        ("Yaw Asare", "+233 55 555 0118", "Manager", "Active"),
    ]
    for i, row in enumerate(rows):
        yy = 865 + i * 41
        if i:
            c.line(88, yy - 21, 1512, yy - 21, "#EDF0EB", 1)
        c.rect(92, yy - 20, 32, 32, SOFT, LINE, r=0)
        c.text(108, yy + 1, "IMG", 8, MUTED, 400, "middle")
        c.text(136, yy + 2, row[0], 14, INK, 600)
        c.text(645, yy + 2, row[1], 14, MUTED)
        c.text(925, yy + 2, row[2], 14, INK)
        c.pill(1198, yy - 18, row[3], WHITE, INK, w=70, h=27, size=11)
        c.text(1430, yy + 2, "Manage", 13, GREEN_2, 700, "middle")
    c.caption("Manager Dashboard Wireframe")
    c.save("figure-5-9-manager-dashboard-wireframe.svg")


def pos():
    c = Canvas("Point-of-Sale Interface Wireframe", "Figure 5.10", "Cashier point-of-sale screen")
    c.header("Point of sale", "New sale", "Cashier")
    c.nav("POS")
    c.text(72, 256, "POINT OF SALE", 12, GREEN_2, 700, spacing=1.5)
    c.text(72, 300, "New sale", 34, INK, 700)
    c.text(72, 331, "Scan or search products, build the cart, and select a tender.", 15, MUTED)
    c.pill(1321, 267, "ONLINE", WHITE, INK, w=112, h=32, size=12)
    # Product lookup column
    c.rect(72, 366, 900, 626, WHITE, LINE, r=16)
    c.text(101, 406, "Find a product", 22, INK, 700)
    c.text(101, 432, "Search by name, SKU, or barcode.", 13, MUTED)
    c.rect(101, 452, 842, 54, WHITE, LINE, r=10)
    c.text(151, 484, "Search or scan barcode", 15, "#899189")
    c.pill(100, 524, "8 products", SOFT, GREEN, w=98, h=28, size=12)
    products = [
        (101, 570, "Whole Chicken", "Poultry · SKU CHK-001", "GH₵ 82.00", "In stock · 18"),
        (530, 570, "Chicken Wings", "Poultry · SKU CHK-014", "GH₵ 66.00", "In stock · 12"),
        (101, 684, "Frozen Tilapia", "Fish · SKU FSH-003", "GH₵ 74.00", "Low stock · 4"),
        (530, 684, "Beef Cubes", "Beef & goat · SKU BEEF-02", "GH₵ 91.00", "In stock · 9"),
    ]
    for x, y, name, sku, price, stock in products:
        c.rect(x, y, 412, 96, WHITE, LINE, r=0)
        c.rect(x + 14, y + 14, 66, 66, SOFT_2, LINE, r=0, sw=1, cls="placeholder")
        c.text(x + 47, y + 51, "IMG", 9, MUTED, 400, "middle")
        c.text(x + 94, y + 30, name, 15, INK, 700)
        c.text(x + 94, y + 52, sku, 11, MUTED)
        c.text(x + 94, y + 76, price, 13, GREEN, 700)
        c.text(x + 255, y + 76, stock, 10, MUTED)
        c.button(x + 335, y + 25, 63, "Add", False, h=40, size=13)
    c.text(101, 912, "USB barcode scanners can type directly into the search field.", 12, MUTED)
    # Cart and payment column
    x, w = 996, 532
    c.rect(x, 366, w, 318, WHITE, LINE, r=16)
    c.text(x + 26, 406, "Current sale", 22, INK, 700)
    c.text(x + w - 24, 404, "Clear cart", 12, GREEN_2, 700, "end")
    for i, (name, qty, price, total) in enumerate([
        ("Whole Chicken", "1.0 kg", "GH₵ 82.00 / kg", "GH₵ 82.00"),
        ("Chicken Wings", "2.0 kg", "GH₵ 66.00 / kg", "GH₵ 132.00"),
    ]):
        yy = 455 + i * 88
        c.line(x + 24, yy - 18, x + w - 24, yy - 18, "#EDF0EB", 1)
        c.text(x + 26, yy + 4, name, 15, INK, 600)
        c.text(x + 26, yy + 28, price, 11, MUTED)
        c.rect(x + 26, yy + 38, 90, 29, WHITE, LINE, r=0)
        c.text(x + 71, yy + 58, qty, 11, INK, 600, "middle")
        c.text(x + w - 24, yy + 15, total, 14, INK, 700, "end")
    c.line(x + 24, 624, x + w - 24, 624)
    c.text(x + 26, 652, "Subtotal", 14, MUTED)
    c.text(x + w - 24, 652, "GH₵ 214.00", 14, INK, 600, "end")
    c.text(x + 26, 678, "TOTAL", 13, GREEN_2, 700, spacing=1)
    c.text(x + w - 24, 679, "GH₵ 214.00", 21, GREEN, 700, "end")
    c.rect(x, 704, w, 288, WHITE, LINE, r=16)
    c.text(x + 26, 744, "Customer (optional)", 17, INK, 700)
    c.rect(x + 26, 761, w - 52, 44, WHITE, LINE, r=8)
    c.text(x + 42, 789, "Search name, phone, or email", 13, "#899189")
    c.text(x + 26, 833, "+ Create walk-in customer", 12, GREEN_2, 700)
    c.text(x + 26, 868, "Payment method", 14, INK, 700)
    for i, (label, selected) in enumerate((("Cash", True), ("Mobile money", False), ("Credit", False))):
        xx = x + 26 + i * 157
        c.rect(xx, 884, 145, 38, WHITE, LINE, r=0)
        c.text(xx + 12, 908, "(x)" if selected else "( )", 11, INK, 500)
        c.text(xx + 40, 908, label, 12, INK, 500)
    c.button(x + 26, 936, w - 52, "Complete sale  ·  GH₵ 214.00", True, h=44, size=14)
    c.caption("Point-of-Sale Interface Wireframe")
    c.save("figure-5-10-pos-wireframe.svg")


def customer_shop_checkout():
    c = Canvas("Customer Product and Checkout Wireframe", "Figure 5.11", "Customer product catalogue and pickup checkout")
    c.rect(0, 0, 800, 1024, BG, "none", r=0)
    c.rect(800, 0, 800, 1024, BG, "none", r=0)
    c.text(64, 54, "LOW-FIDELITY WIREFRAME · BROWSE PRODUCTS", 12, MUTED, 600, spacing=0.5)
    c.text(836, 54, "LOW-FIDELITY WIREFRAME · CHECKOUT", 12, MUTED, 600, spacing=0.5)
    # Storefront side
    c.rect(40, 77, 720, 910, WHITE, LINE, r=0)
    c.brand(68, 125, scale=0.86)
    c.text(590, 116, "Shop   Cart (2)   My account", 12, GREEN_2, 600, "end")
    c.line(68, 153, 732, 153)
    c.text(68, 205, "Browse the shop", 30, INK, 700)
    c.text(68, 232, "Find something for the table.", 13, MUTED)
    c.rect(68, 257, 423, 44, WHITE, LINE, r=8)
    c.text(111, 284, "Search products", 13, "#899189")
    c.rect(502, 257, 150, 44, WHITE, LINE, r=8)
    c.text(520, 284, "All categories  ▾", 12, MUTED)
    c.button(660, 257, 72, "Find", False, h=44, size=12)
    c.text(68, 334, "Poultry", 12, GREEN_2, 700)
    c.text(732, 334, "30 products", 11, MUTED, 400, "end")
    shopcards = [
        (68, 356, "Whole Chicken", "GH₵ 82.00 / kg", "Popular cut"),
        (399, 356, "Chicken Wings", "GH₵ 66.00 / kg", "Frozen · 1 kg pack"),
        (68, 619, "Chicken Drumsticks", "GH₵ 58.00 / kg", "Frozen · 1 kg pack"),
        (399, 619, "Chicken Breast", "GH₵ 76.00 / kg", "Boneless cut"),
    ]
    for x, y, name, price, detail in shopcards:
        c.rect(x, y, 312, 240, WHITE, LINE, r=0)
        c.rect(x + 1, y + 1, 310, 111, SOFT_2, LINE, r=0, sw=1, cls="placeholder")
        c.text(x + 156, y + 61, "PRODUCT IMAGE", 12, MUTED, 500, "middle", 0.7)
        c.text(x + 17, y + 139, "POULTRY", 9, MUTED, 700, spacing=0.9)
        c.text(x + 17, y + 164, name, 16, INK, 700)
        c.text(x + 17, y + 187, detail, 11, MUTED)
        c.text(x + 17, y + 221, price, 14, GREEN, 700)
        c.button(x + 251, y + 198, 42, "+", False, h=36, size=18)
    c.text(68, 940, "Store pickup in Osu  ·  Secure customer account", 11, MUTED)
    # Checkout side
    c.rect(824, 77, 736, 910, WHITE, LINE, r=0)
    c.brand(852, 125, scale=0.86)
    c.text(1528, 116, "Cart   Account", 12, GREEN_2, 600, "end")
    c.line(852, 153, 1532, 153)
    c.text(852, 194, "← Back to cart", 12, GREEN_2, 600)
    c.pill(852, 219, "STORE PICKUP", WHITE, INK, w=132, h=28, size=10)
    c.text(852, 291, "Checkout", 32, INK, 700)
    c.text(852, 318, "Reserve your items and pay when you collect.", 13, MUTED)
    c.rect(852, 349, 430, 209, WHITE, LINE, r=14)
    c.text(875, 383, "Pickup details", 18, INK, 700)
    c.text(875, 409, "Collection at Grand Pa’s Cold Store in Osu.", 11, MUTED)
    c.rect(875, 427, 384, 58, SOFT_2, LINE, r=0)
    c.text(892, 451, "Ama Owusu", 13, INK, 700)
    c.text(892, 472, "Signed-in customer account", 10, MUTED)
    c.text(875, 520, "PAYMENT AT COLLECTION", 10, MUTED, 700, spacing=0.9)
    c.rect(852, 577, 430, 146, WHITE, LINE, r=0, sw=1.5)
    c.text(879, 617, "(x)", 14, INK, 500)
    c.text(900, 616, "Cash at pickup", 14, INK, 700)
    c.text(900, 642, "Pay store staff when you collect your order.", 11, MUTED)
    c.text(900, 665, "Reserved stock is held for your collection.", 11, MUTED)
    c.rect(1302, 349, 230, 374, "#FCFCFA", LINE, r=14)
    c.text(1322, 385, "Order summary", 17, INK, 700)
    c.text(1322, 426, "Whole Chicken", 11, INK, 600)
    c.text(1510, 426, "GH₵ 82.00", 11, INK, 600, "end")
    c.text(1322, 449, "1.0 kg", 10, MUTED)
    c.line(1322, 474, 1512, 474)
    c.text(1322, 501, "Chicken Wings", 11, INK, 600)
    c.text(1510, 501, "GH₵ 66.00", 11, INK, 600, "end")
    c.text(1322, 524, "1.0 kg", 10, MUTED)
    c.line(1322, 551, 1512, 551)
    c.text(1322, 581, "Subtotal", 11, MUTED)
    c.text(1510, 581, "GH₵ 148.00", 11, INK, 600, "end")
    c.text(1322, 616, "Pickup", 11, MUTED)
    c.text(1510, 616, "Store pickup", 10, INK, 600, "end")
    c.line(1322, 639, 1512, 639)
    c.text(1322, 678, "TOTAL", 11, GREEN_2, 700, spacing=0.7)
    c.text(1510, 680, "GH₵ 148.00", 16, GREEN, 700, "end")
    c.button(852, 751, 680, "Place pickup order", True, h=50, size=15)
    c.text(852, 827, "You’ll receive an order number and pickup reservation details.", 11, MUTED)
    c.text(852, 856, "Payment is collected at the store.", 11, MUTED)
    c.text(852, 935, "Customer order · Store pickup · Cash at collection", 11, MUTED)
    c.caption("Customer Product and Checkout Interface Wireframe")
    c.save("figure-5-11-customer-product-checkout-wireframe.svg")


def inventory_credit():
    c = Canvas("Inventory and Customer-Credit Interface Wireframe", "Figure 5.12", "Staff inventory and customer credit management screens")
    c.header("Inventory and customer accounts", "Stock and credit", "Manager")
    c.nav("Inventory")
    # Inventory view
    c.text(72, 254, "INVENTORY", 12, GREEN_2, 700, spacing=1.4)
    c.text(72, 292, "Stock control", 29, INK, 700)
    c.text(72, 318, "Current quantities and authorized movements.", 13, MUTED)
    stats = [(72, "ACTIVE PRODUCTS", "30", WHITE), (280, "IN STOCK", "26", WHITE), (488, "LOW STOCK", "3", WHITE), (696, "OUT OF STOCK", "1", WHITE)]
    for x, label, val, fill in stats:
        c.rect(x, 344, 188, 82, WHITE, LINE, r=12)
        c.text(x + 16, 369, label, 9, MUTED, 700, spacing=0.5)
        c.text(x + 16, 408, val, 27, GREEN if label != "LOW STOCK" else "#805515", 700)
        c.rect(x + 145, 371, 28, 28, fill, LINE, r=0)
        c.text(x + 159, 389, "#", 10, MUTED, 500, "middle")
    # Inventory table
    c.rect(72, 448, 812, 354, WHITE, LINE, r=14)
    c.text(95, 483, "Current stock", 18, INK, 700)
    c.text(95, 506, "Quantity / reorder level", 11, MUTED)
    c.rect(92, 525, 772, 36, SOFT_2, "none", r=6)
    headers = [(108,"PRODUCT"),(398,"SKU"),(522,"CATEGORY"),(675,"QTY / REORDER"),(815,"STATUS")]
    for x, label in headers: c.text(x, 548, label, 9, MUTED, 700, spacing=0.5)
    products = [
        ("Whole Chicken", "CHK-001", "Poultry", "18 / 5", "In stock", WHITE, INK),
        ("Chicken Wings", "CHK-014", "Poultry", "4 / 6", "Low stock", WHITE, INK),
        ("Frozen Tilapia", "FSH-003", "Fish", "0 / 3", "Out of stock", WHITE, INK),
        ("Beef Cubes", "BEEF-02", "Beef & goat", "9 / 4", "In stock", WHITE, INK),
    ]
    for i, (name, sku, cat, qty, status, fill, fg) in enumerate(products):
        yy = 597 + i * 50
        c.line(92, yy - 21, 864, yy - 21, "#EDF0EB", 1)
        c.text(108, yy, name, 11, INK, 600)
        c.text(398, yy, sku, 10, MUTED)
        c.text(522, yy, cat, 10, MUTED)
        c.text(705, yy, qty, 11, INK, 600, "middle")
        c.pill(781, yy - 18, status, fill, fg, w=72 if status == "Low stock" else (89 if status == "Out of stock" else 66), h=25, size=9)
    c.text(96, 785, "View movement history  →", 11, GREEN_2, 700)
    # Movement form
    c.rect(904, 344, 624, 458, WHITE, LINE, r=14)
    c.pill(930, 368, "CONTROLLED UPDATE", WHITE, INK, w=151, h=27, size=9)
    c.text(930, 430, "Record a stock movement", 20, INK, 700)
    c.text(930, 455, "Balance and immutable movement ledger update together.", 11, MUTED)
    c.field(930, 490, 260, "Product", "Select a product  ▾", h=42)
    c.field(1210, 490, 290, "Movement type", "Stock receipt  ▾", h=42)
    c.field(930, 585, 260, "Quantity", "Enter quantity", placeholder=True, h=42)
    c.field(1210, 585, 290, "Reason / reference", "Supplier delivery", h=42)
    c.button(930, 687, 570, "Record movement", False, h=48, size=14)
    c.text(930, 762, "Authorized actions depend on the staff role.", 10, MUTED)
    # Credit view
    c.text(72, 851, "CUSTOMER CREDIT", 12, GREEN_2, 700, spacing=1.4)
    c.text(72, 887, "Customer accounts", 25, INK, 700)
    c.text(72, 912, "Balances update through credit sales and repayments.", 12, MUTED)
    c.rect(72, 934, 832, 66, WHITE, LINE, r=12)
    c.rect(91, 947, 567, 40, WHITE, LINE, r=8)
    c.text(107, 973, "Search by customer name or phone", 11, "#899189")
    c.button(672, 947, 104, "Search", False, h=40, size=12)
    c.text(794, 973, "Manage →", 11, GREEN_2, 700)
    # Credit account detail card
    c.rect(930, 828, 598, 172, WHITE, LINE, r=14)
    c.text(954, 864, "Ama Owusu", 18, INK, 700)
    c.text(954, 887, "+233 24 555 0142  ·  Active", 11, MUTED)
    c.line(954, 903, 1504, 903)
    c.text(954, 932, "CREDIT LIMIT", 9, MUTED, 700, spacing=0.5)
    c.text(954, 958, "GH₵ 1,000.00", 15, INK, 700)
    c.text(1150, 932, "OUTSTANDING", 9, MUTED, 700, spacing=0.5)
    c.text(1150, 958, "GH₵ 280.00", 15, "#805515", 700)
    c.text(1347, 932, "AVAILABLE", 9, MUTED, 700, spacing=0.5)
    c.text(1347, 958, "GH₵ 720.00", 15, GREEN, 700)
    c.pill(954, 968, "Record repayment", WHITE, INK, w=143, h=23, size=9)
    c.pill(1110, 968, "Credit history", WHITE, INK, w=111, h=23, size=9)
    c.pill(1234, 968, "Manage limit", WHITE, INK, w=117, h=23, size=9)
    c.caption("Inventory and Customer-Credit Interface Wireframe")
    c.save("figure-5-12-inventory-customer-credit-wireframe.svg")


if __name__ == "__main__":
    login()
    dashboard()
    pos()
    customer_shop_checkout()
    inventory_credit()
    print(f"Created five wireframe SVGs in {OUT}")
