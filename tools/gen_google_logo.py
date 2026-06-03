#!/usr/bin/env python3
"""Pixelated rainbow Google "G" — chunky-pixel method (see tools/gen_bg.py).

Per-pixel ring split into the four Google colours, positioned like the real
mark (red on top, blue on the right, yellow on the left, green on the bottom)
with a blue crossbar poking in through a gap on the right. Rendered on a small
grid then 2x NEAREST-upscaled so the pixels stay crisp and retro.
"""
import math
from PIL import Image

L = 24                       # logical grid (LxL); final is 2x via NEAREST
SCALE = 2
img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
px = img.load()

RED    = (234, 67, 53, 255)
YELLOW = (251, 188, 5, 255)
GREEN  = (52, 168, 83, 255)
BLUE   = (66, 133, 244, 255)

cx = cy = (L - 1) / 2.0
R_OUT = L / 2.0
R_IN  = R_OUT * 0.55
OPEN  = 27                   # half-angle of the right-side gap (degrees)


def ring_color(deg):         # deg: math convention (0=east, CCW, 90=top)
    if deg < OPEN or deg >= 360 - OPEN:  return None   # the G's mouth (right)
    if deg < 52:   return BLUE     # upper-right shoulder
    if deg < 150:  return RED      # top
    if deg < 232:  return YELLOW   # left
    if deg < 308:  return GREEN    # bottom
    return BLUE                    # lower-right shoulder


# ring
for y in range(L):
    for x in range(L):
        dx, dy = x - cx, y - cy
        if R_IN <= math.hypot(dx, dy) <= R_OUT:
            c = ring_color(math.degrees(math.atan2(-dy, dx)) % 360)
            if c:
                px[x, y] = c

# blue crossbar: from the centre out to the right edge, thinner than the gap
bar_half = (R_OUT - R_IN) / 2.0 - 0.4
for y in range(L):
    if abs(y - cy) <= bar_half:
        for x in range(L):
            if -0.5 <= (x - cx) and math.hypot(x - cx, y - cy) <= R_OUT:
                px[x, y] = BLUE

out = img.resize((L * SCALE, L * SCALE), Image.NEAREST)
out.save("Images/google_g_pixel.png")
print("wrote Images/google_g_pixel.png", out.size)
