"""Слой аннотаций поверх настоящей записи vhs.

Каждая аннотация — это золотая рамка вокруг области терминала и подпись
в панели под ним. Слой рисуется прозрачным PNG на весь кадр, и ffmpeg
показывает его на своём отрезке времени.
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "verify.mp4"
LAYERS = HERE / "layers"

WIDTH, TERM_HEIGHT, PANEL_HEIGHT = 1500, 800, 116
HEIGHT = TERM_HEIGHT + PANEL_HEIGHT

GOLD = (240, 198, 116, 255)
GOLD_SOFT = (240, 198, 116, 90)
PANEL_TEXT = (235, 224, 205, 255)

FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# Сетка терминала, измеренная по кадру записи: верх первой строки, шаг строки,
# ширина символа и левое поле, в пикселях.
TOP, LINE, CHAR, LEFT = 26, 19.21, 10.15, 28


def box(first_line, line_count, chars, scroll=0):
    """Прямоугольник вокруг строк вывода, в пикселях кадра."""
    top = TOP + (first_line - scroll) * LINE
    return (
        20,
        round(top) - 5,
        min(round(LEFT + chars * CHAR) + 16, WIDTH - 16),
        round(top + line_count * LINE) + 3,
    )


ANNOTATIONS = [
    {
        "at": (6.3, 10.4),
        "box": box(first_line=3, line_count=4, chars=145),
        "en": "The agent reported the change as done, but it never ran a single check.",
        "ru": "Агент отчитался, что всё готово, но ни одной проверки он не запускал.",
    },
    {
        "at": (10.9, 14.6),
        "box": box(first_line=13, line_count=2, chars=9),
        "en": "A 1 means the work does not pass.",
        "ru": "Единица в ответе значит, что работа не принята.",
    },
    {
        "at": (17.2, 21.1),
        "box": box(first_line=20, line_count=2, chars=49),
        "en": "LexForge runs the tests itself and records how they ended.",
        "ru": "LexForge сам запускает тесты и записывает, чем они кончились.",
    },
    {
        "at": (26.2, 30.3),
        "box": box(first_line=31, line_count=1, chars=61),
        "en": "The tests passed, and now LexForge accepts the change.",
        "ru": "Тесты прошли, и теперь LexForge принимает изменение.",
    },
    {
        "at": (31.2, 35.3),
        "box": box(first_line=33, line_count=4, chars=76, scroll=2),
        "en": "What it cannot check, LexForge names outright: the design, the requirements, the quality of the code.",
        "ru": "Что проверить нельзя, LexForge называет прямо: дизайн, требования, качество кода.",
    },
]


def wrap(draw, text, font, limit):
    lines, line = [], ""
    for word in text.split():
        probe = f"{line} {word}".strip()
        if draw.textlength(probe, font=font) <= limit:
            line = probe
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def layer(annotation, language, path):
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    x0, y0, x1, y1 = annotation["box"]
    draw.rectangle((x0 - 2, y0 - 2, x1 + 2, y1 + 2), outline=GOLD_SOFT, width=6)
    draw.rectangle((x0, y0, x1, y1), outline=GOLD, width=3)

    font = ImageFont.truetype(FONT_BOLD if Path(FONT_BOLD).exists() else FONT, 27)
    lines = wrap(draw, annotation[language], font, WIDTH - 130)
    height = len(lines) * 34
    top = TERM_HEIGHT + (PANEL_HEIGHT - height) / 2

    draw.rectangle((44, top + 4, 50, top + height - 4), fill=GOLD)
    for index, line in enumerate(lines):
        draw.text((70, top + index * 34), line, font=font, fill=PANEL_TEXT)

    image.save(path)


def render(language, output):
    LAYERS.mkdir(exist_ok=True)
    paths = []
    for index, annotation in enumerate(ANNOTATIONS):
        path = LAYERS / f"{language}-{index}.png"
        layer(annotation, language, path)
        paths.append(path)

    inputs = ["-i", str(SOURCE)]
    for path in paths:
        inputs += ["-loop", "1", "-i", str(path)]

    steps = [
        f"[0:v]pad={WIDTH}:{HEIGHT}:0:0:0x11111B,"
        f"drawbox=x=0:y={TERM_HEIGHT}:w={WIDTH}:h=2:color=0xF0C674@0.35:t=fill[base]"
    ]
    label = "base"
    for index, annotation in enumerate(ANNOTATIONS):
        start, end = annotation["at"]
        nxt = f"v{index}"
        steps.append(
            f"[{label}][{index + 1}:v]overlay=0:0:enable='between(t,{start},{end})'[{nxt}]"
        )
        label = nxt

    command = [
        "ffmpeg", "-v", "error", "-y", *inputs,
        "-filter_complex", ";".join(steps),
        "-map", f"[{label}]", "-t", "35.4",
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(output),
    ]
    subprocess.run(command, check=True)


if __name__ == "__main__":
    for language in sys.argv[1:] or ["en", "ru"]:
        output = HERE / f"annotated-{language}.mp4"
        render(language, output)
        print(f"{output.name} готов")
