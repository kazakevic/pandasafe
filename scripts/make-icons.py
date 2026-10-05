"""Draws the PandaSafe icon and writes icons/icon-{16,32,48,128}.png.

Run: python3 scripts/make-icons.py (needs Pillow). The icon is drawn at
1024px and downscaled so the small sizes stay smooth.
"""

from pathlib import Path

from PIL import Image, ImageDraw

S = 1024
GREEN = (34, 160, 107)
GREEN_DARK = (21, 112, 74)
INK = (26, 28, 30)
WHITE = (255, 255, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Shield-ish rounded square
d.rounded_rectangle((16, 16, S - 16, S - 16), radius=230, fill=GREEN)
d.rounded_rectangle((16, S // 2, S - 16, S - 16), radius=230, fill=GREEN_DARK)
d.rectangle((16, S // 2, S - 16, S // 2 + 240), fill=GREEN_DARK)

# Ears
for cx in (275, S - 275):
    d.ellipse((cx - 130, 170, cx + 130, 430), fill=INK)

# Head
d.ellipse((150, 230, S - 150, 880), fill=WHITE)


def patch(cx, cy, angle):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse((cx - 85, cy - 120, cx + 85, cy + 120), fill=INK)
    ld.ellipse((cx - 30, cy - 45, cx + 30, cy + 15), fill=WHITE)
    img.alpha_composite(layer.rotate(angle, center=(cx, cy), resample=Image.BICUBIC))


patch(375, 540, -35)
patch(S - 375, 540, 35)

# Nose and mouth
d.ellipse((S // 2 - 60, 650, S // 2 + 60, 730), fill=INK)
d.arc((S // 2 - 90, 660, S // 2, 780), start=20, end=150, fill=INK, width=22)
d.arc((S // 2, 660, S // 2 + 90, 780), start=30, end=160, fill=INK, width=22)

out = Path(__file__).resolve().parent.parent / "icons"
out.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(out / f"icon-{size}.png")
