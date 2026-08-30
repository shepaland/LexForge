"""Картинка для social preview репозитория: 1280x640, как того просит GitHub.

Слева — имя и одна мысль о том, что делает LexForge. Справа — кусок настоящего
ответа команды: тот же отказ, что и на записи, с золотой рамкой на строке
находки. Ссылка на страницу и команда установки лежат внизу.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "social-preview.png"

WIDTH, HEIGHT = 1280, 640

BACKGROUND = (30, 30, 46)
PANEL = (24, 24, 37)
GOLD = (240, 198, 116)
TEXT = (235, 224, 205)
DIM = (150, 152, 175)
RED = (243, 139, 168)

SANS = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
MONO = "/System/Library/Fonts/Menlo.ttc"

LEAD = [
    "Nine skills carry a change from the",
    "request to the archived spec. Every",
    "gate is a command, and it answers",
    "with an exit code.",
]

TERMINAL = [
    ("$ lexforge verify --change add-search", TEXT),
    ("  1  error  evidence-not-fresh", RED),
    ('     check "tests" is missing:', RED),
    ("     the ledger holds no stamp.", RED),
    ("$ echo $?", TEXT),
    ("1", GOLD),
]

PANEL_BOX = (656, 128, 1216, 424)
FINDING_LINES = (1, 3)


def main():
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)

    title = ImageFont.truetype(SANS, 80)
    lead = ImageFont.truetype(SANS, 30)
    small = ImageFont.truetype(SANS, 22)
    mono = ImageFont.truetype(MONO, 20, index=0)
    mono_bold = ImageFont.truetype(MONO, 22, index=1)

    draw.rectangle((0, 0, 10, HEIGHT), fill=GOLD)

    draw.text((72, 96), "LexForge", font=title, fill=TEXT)
    draw.text((76, 196), "Spec-driven pipeline for coding agents", font=lead, fill=GOLD)

    for index, line in enumerate(LEAD):
        draw.text((76, 268 + index * 40), line, font=lead, fill=DIM)

    draw.text((76, 512), "github.com/shepaland/LexForge", font=small, fill=TEXT)
    draw.text((76, 552), "npm install -g lexforge", font=mono_bold, fill=GOLD)

    left, top, right, bottom = PANEL_BOX
    draw.rounded_rectangle((left, top, right, bottom), radius=16, fill=PANEL)

    line_height = 44
    first_line = top + 34
    for index, (line, color) in enumerate(TERMINAL):
        draw.text((left + 30, first_line + index * line_height), line, font=mono, fill=color)

    start, end = FINDING_LINES
    draw.rounded_rectangle(
        (
            left + 16,
            first_line + start * line_height - 10,
            right - 16,
            first_line + (end + 1) * line_height - 16,
        ),
        radius=10,
        outline=GOLD,
        width=3,
    )

    draw.text(
        (left + 4, bottom + 34),
        "verify answers 1 until every check has been run.",
        font=small,
        fill=DIM,
    )

    image.save(OUTPUT)

    overflow = [line for line, _ in TERMINAL if draw.textlength(line, font=mono) > right - left - 60]
    print(f"{OUTPUT.name}: {image.size[0]}x{image.size[1]}", "перелив:", overflow or "нет")


if __name__ == "__main__":
    main()
