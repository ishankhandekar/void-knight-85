#!/usr/bin/env python3
"""Recolour the original crystal-cave level wallpaper from blue to green.

Swaps the green and blue channels (blue rock -> green rock) while leaving the
cyan crystals cyan and preserving the exact structure/brightness of the
original art. Output is the home-screen background.
"""
from PIL import Image

SRC = "Images/crystal_cave_background_by_fellfeline_dektmf0-fullview-1.png.png"
DST = "Images/emerald_cave_bg.png"

src = Image.open(SRC).convert("RGB")
r, g, b = src.split()
out = Image.merge("RGB", (r, b, g))      # G<->B: blue->green, cyan stays cyan
out.save(DST)
print("wrote", DST, out.size)
