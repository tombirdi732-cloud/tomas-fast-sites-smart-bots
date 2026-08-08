"""Одна картинка со всеми экранами приложения — для презентации."""

import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "store"
OUT = ROOT / "docs" / "presentation"

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

GREEN = "#21A038"
INK = "#1A1D1F"
SOFT = "#8B9296"
BG = "#F4F6F7"

SCREENS = [
    ("04-lenta.png", "Лента боксов рядом"),
    ("05-box.png", "Карточка бокса"),
    ("06-oformlenie.png", "Оформление"),
    ("07-kod-vydachi.png", "Код выдачи"),
    ("08-zakazy.png", "Мои заказы"),
    ("09-izbrannoe.png", "Избранное"),
    ("10-profil.png", "Профиль"),
    ("01-eda-ne-propadet.png", "Знакомство"),
    ("03-ryadom-s-vami.png", "Геолокация"),
    ("02-deshevle.png", "Цена"),
]

# Пять экранов в ряд, два ряда.
COLS, ROWS = 5, 2
PHONE_W = 300
GAP_X, GAP_Y = 44, 78
PAD = 70
HEAD = 190
CAPTION = 46
RADIUS = 26


def rounded(image: Image.Image, radius: int) -> Image.Image:
    """Скругляем углы: прямоугольный скриншот на макете выглядит сырым."""
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *image.size], radius=radius, fill=255)
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    out.paste(image, (0, 0), mask)
    return out


def shadow(size, radius, blur=14, spread=6):
    from PIL import ImageFilter

    w, h = size
    layer = Image.new("RGBA", (w + blur * 4, h + blur * 4), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        [blur * 2 - spread // 2, blur * 2, w + blur * 2 + spread // 2, h + blur * 2 + spread],
        radius=radius,
        fill=(26, 29, 31, 46),
    )
    return layer.filter(ImageFilter.GaussianBlur(blur))


first = Image.open(f"{SRC}/{SCREENS[0][0]}")
phone_h = round(PHONE_W * first.height / first.width)

W = PAD * 2 + COLS * PHONE_W + (COLS - 1) * GAP_X
H = HEAD + PAD + ROWS * (phone_h + CAPTION) + (ROWS - 1) * GAP_Y + PAD

canvas = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(canvas)

# Шапка
draw.rectangle([0, 0, W, HEAD], fill=GREEN)
draw.text((PAD, 52), "СПАСАЙ", font=ImageFont.truetype(BOLD, 54), fill="#FFFFFF")
draw.text(
    (PAD, 118),
    "еда из кафе и пекарен рядом — со скидкой до 70%, пока она не пропала",
    font=ImageFont.truetype(REG, 26),
    fill="#DCF2E1",
)

cap_font = ImageFont.truetype(REG, 23)

for i, (name, caption) in enumerate(SCREENS):
    col, row = i % COLS, i // COLS
    x = PAD + col * (PHONE_W + GAP_X)
    y = HEAD + PAD + row * (phone_h + CAPTION + GAP_Y)

    phone = Image.open(f"{SRC}/{name}").convert("RGB").resize((PHONE_W, phone_h), Image.LANCZOS)
    sh = shadow((PHONE_W, phone_h), RADIUS)
    canvas.paste(sh, (x - 28, y - 28), sh)
    canvas.paste(rounded(phone, RADIUS), (x, y), rounded(phone, RADIUS))

    tw = draw.textlength(caption, font=cap_font)
    draw.text((x + (PHONE_W - tw) / 2, y + phone_h + 16), caption, font=cap_font, fill=SOFT)

canvas.save(f"{OUT}/screens.png")
print("screens.png", canvas.size)


def strip(items, path):
    """Полоса из пяти экранов без шапки — для вёрстки документа."""
    w = PAD * 2 + 5 * PHONE_W + 4 * GAP_X
    h = PAD + phone_h + CAPTION + PAD
    sheet = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(sheet)

    for i, (name, caption) in enumerate(items):
        x = PAD + i * (PHONE_W + GAP_X)
        y = PAD
        ph = Image.open(f"{SRC}/{name}").convert("RGB").resize((PHONE_W, phone_h), Image.LANCZOS)
        sh = shadow((PHONE_W, phone_h), RADIUS)
        sheet.paste(sh, (x - 28, y - 28), sh)
        sheet.paste(rounded(ph, RADIUS), (x, y), rounded(ph, RADIUS))
        tw = d.textlength(caption, font=cap_font)
        d.text((x + (PHONE_W - tw) / 2, y + phone_h + 16), caption, font=cap_font, fill=SOFT)

    sheet.save(path, quality=88, optimize=True)
    print(path.rsplit("/", 1)[-1], sheet.size)


strip(SCREENS[:5], f"{OUT}/screens-1.jpg")
strip(SCREENS[5:], f"{OUT}/screens-2.jpg")
