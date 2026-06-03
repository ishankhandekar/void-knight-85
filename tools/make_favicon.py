#!/usr/bin/env python3
"""Build favicon.png from the in-game knight sprite (Sprites/MaskedMCIdle.png).

Crops the knight+sword (frame 0 of the idle sheet), scales it up crisply, and
sets it on a dark rounded-square backdrop with a soft gold glow to match the
menu's glowing knight. Output: favicon.png (128x128).
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..")
SIZE = 128
SCALE = 4
BG = (13, 15, 20, 255)       # game dark
GOLD = (241, 196, 15)        # theme accent

src = Image.open(os.path.join(ROOT, "Sprites/MaskedMCIdle.png")).convert("RGBA")
fw, fh = src.width // 2, src.height // 2
frame = src.crop((0, 0, fw, fh))            # frame 0 (top-left)
knight = frame.crop(frame.getbbox())        # trim transparent margins -> the knight+sword
kw, kh = knight.width * SCALE, knight.height * SCALE
knight = knight.resize((kw, kh), Image.NEAREST)   # crisp pixel upscale

canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# dark rounded-square backdrop
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
try:
    ImageDraw.Draw(bg).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=26, fill=BG)
except AttributeError:
    ImageDraw.Draw(bg).rectangle([0, 0, SIZE - 1, SIZE - 1], fill=BG)
canvas.alpha_composite(bg)

# soft gold glow behind the helm
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gx, gy = SIZE // 2 - 6, SIZE // 2 - 6
ImageDraw.Draw(glow).ellipse([gx - 30, gy - 28, gx + 30, gy + 28], fill=GOLD + (120,))
glow = glow.filter(ImageFilter.GaussianBlur(13))
canvas.alpha_composite(glow)

# knight, centered
canvas.alpha_composite(knight, ((SIZE - kw) // 2, (SIZE - kh) // 2))

out = os.path.join(ROOT, "favicon.png")
canvas.save(out)
print("wrote", os.path.normpath(out), canvas.size)
