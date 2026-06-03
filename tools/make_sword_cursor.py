#!/usr/bin/env python3
"""Build swordcursor.png from the iron-sword source frame.

Source: _iron_sword_src.png — the iron sword from "minecraftswords-mr-bs", a
cursor set the author released to the Public Domain (see pack readme).

Transforms: flip horizontally (point up-right), then remap colours by region.
The source is clean indexed pixel art (10 exact colours), so each part is
recoloured by exact-colour match:

  blade      -> steel grey      (kept grey)
  guard/sep. -> brown           (was grey)
  handle     -> grey            (was brown)
  outlines   -> left dark

Edit COLOR_MAP to retune, then re-run:  python3 tools/make_sword_cursor.py
"""
import os
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "_iron_sword_src.png")
OUT = os.path.join(os.path.dirname(__file__), "..", "swordcursor.png")

# exact source colour -> target colour. Unlisted colours are left unchanged.
COLOR_MAP = {
    # --- blade: keep grey (steel re-shade) ---
    (255, 255, 255): (190, 193, 199),   # blade highlight
    (216, 216, 216): (157, 160, 166),   # blade light
    # (68,68,68) blade dark edge -> left as-is

    # --- separator / crossguard: grey -> brown ---
    (150, 150, 150): (150, 108, 58),    # guard light  -> brown
    (107, 107, 107): (104, 72, 36),     # guard dark   -> darker brown

    # --- handle: brown -> grey ---
    (137, 103, 39): (198, 201, 207),    # handle highlight -> light grey
    (104, 78, 30): (152, 156, 164),     # handle mid       -> mid grey
    (73, 54, 21): (110, 114, 123),      # handle dark      -> dark grey
    (40, 30, 11): (66, 68, 75),         # handle shadow    -> darkest grey
    # (40,40,40) outline -> left as-is
}

im = Image.open(SRC).convert("RGBA")
im = im.transpose(Image.FLIP_LEFT_RIGHT)          # flip the sword's direction

px = im.load()
W, H = im.size
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        t = COLOR_MAP.get((r, g, b))
        if t:
            px[x, y] = (t[0], t[1], t[2], a)

op = [(x, y) for y in range(H) for x in range(W) if px[x, y][3] > 0]
topy = min(y for _, y in op)
tipx = max(x for x, y in op if y <= topy + 1)     # tip = topmost-rightmost
boty = max(y for _, y in op)
low = [x for x, y in op if y >= boty - 3]
print(f"tip=({tipx},{topy})  grip=({round(sum(low)/len(low))},{boty - 4})")

im.save(os.path.normpath(OUT))
print("wrote", os.path.normpath(OUT))
