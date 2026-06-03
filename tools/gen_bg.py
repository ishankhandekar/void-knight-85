#!/usr/bin/env python3
"""Procedural "Emerald Hollow" cavern background.

A close recreation of the reference crystal-cave wallpaper
(Images/crystal_cave_background_by_fellfeline...png) recoloured to a green
emerald cave, with the spires moved to new positions:

  1. banded gradient sky (lightest in the open upper-middle)
  2. puffy ROUNDED rock-clouds in three receding layers
  3. a medium rounded rock layer with a prominent CENTRAL hump (like the ref)
  4. a rounded stalactite ceiling: bulbous lobes tapering into drips of varied
     length, plus a few long thin ones
  5. foreground = TWO jagged, rocky spires (noisy edges, sharp tips -- not
     smooth triangles) rising from a lumpy rounded base; spires repositioned
  6. small emerald/teal/lime CRYSTAL twinkles embedded only in the dark rock,
     clustered at the spire bases, plus faint air motes

Rendered at half-res and NEAREST-upscaled 2x for chunky retro pixels.
"""
import math, random
from PIL import Image, ImageDraw

W, H = 384, 192
SCALE = 2
img = Image.new("RGB", (W, H))
px = img.load()
draw = ImageDraw.Draw(img)


def clamp(v):
    return 0 if v < 0 else 255 if v > 255 else int(v)


def lerp(a, b, t):
    return tuple(clamp(a[i] + (b[i] - a[i]) * t) for i in range(3))


def mix(a, b, t):
    return lerp(a, b, t)


def put(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        px[x, y] = c


# --- Emerald Hollow palette ---------------------------------------------------
C_SKY_TOP   = (24, 52, 44)      # muted green up high
C_SKY_LIGHT = (160, 208, 180)   # pale seafoam open band (lightest)
C_SKY_MID   = (72, 126, 102)
C_SKY_BOT   = (16, 40, 34)

CLOUD   = [(134, 176, 152), (100, 144, 120), (70, 112, 92)]  # far -> near
MIDROCK = (46, 84, 68)          # medium rounded rock layer
C_CEIL  = (10, 26, 22)          # near-black green ceiling rock
C_FORE  = (6, 18, 14)           # darkest foreground rock
EDGE    = (140, 196, 168)       # faint rim-light tint

GEM_EMER = ((212, 255, 226), (70, 202, 138), (20, 98, 72), (150, 240, 190))
GEM_TEAL = ((206, 255, 248), (78, 198, 196), (24, 94, 100), (150, 236, 226))
GEM_LIME = ((238, 255, 202), (170, 226, 98), (78, 112, 42), (208, 242, 150))

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def make_noise(seed, n_ctrl):
    """Smooth value-noise over x in [0, W) via control points."""
    rnd = random.Random(seed)
    ctrl = [rnd.uniform(0.0, 1.0) for _ in range(n_ctrl)]

    def f(x):
        t = (x / W) * (n_ctrl - 1)
        i = int(t) % (n_ctrl - 1)
        frac = t - int(t)
        a, b = ctrl[i], ctrl[i + 1]
        s = frac * frac * (3 - 2 * frac)
        return a + (b - a) * s

    return f


# --- 1) banded gradient sky ---------------------------------------------------
def sky(fy):
    if fy < 0.33:
        return lerp(C_SKY_TOP, C_SKY_LIGHT, fy / 0.33)
    if fy < 0.63:
        return lerp(C_SKY_LIGHT, C_SKY_MID, (fy - 0.33) / 0.30)
    return lerp(C_SKY_MID, C_SKY_BOT, (fy - 0.63) / 0.37)


BANDS = 16
for y in range(H):
    base = sky(round((y / (H - 1)) * BANDS) / BANDS)
    for x in range(W):
        o = (BAYER[y % 4][x % 4] - 7.5) / 7.5 * 2.0
        px[x, y] = (clamp(base[0] + o), clamp(base[1] + o), clamp(base[2] + o))


# --- 2) puffy rounded rock-clouds (far -> near, seamless) ---------------------
def cloudbank(color, cy, r_min, r_max, count, seed):
    rnd = random.Random(seed)
    for i in range(count):
        x = (i + 0.5) * W / count + rnd.uniform(-W / count / 3, W / count / 3)
        r = rnd.uniform(r_min, r_max)
        yy = cy + rnd.uniform(-r * 0.18, r * 0.18)
        for ox in (0, -W, W):
            draw.ellipse([x + ox - r, yy - r, x + ox + r, yy + r], fill=color)
    draw.rectangle([0, int(cy), W, H], fill=color)


cloudbank(CLOUD[0], H * 0.50, 24, 44, 6, seed=11)
cloudbank(CLOUD[1], H * 0.61, 26, 50, 5, seed=23)
cloudbank(CLOUD[2], H * 0.72, 30, 56, 5, seed=31)


# --- silhouette fill helpers --------------------------------------------------
def fill_above(bottom, color, rim=None):
    for x in range(W):
        by = int(round(bottom[x]))
        if by >= 0:
            draw.line([(x, 0), (x, by)], fill=color)
        if rim is not None and 0 <= by < H:
            px[x, by] = rim


def fill_below(top, color, rim=None):
    for x in range(W):
        ty = int(round(top[x]))
        if ty < H:
            draw.line([(x, ty), (x, H)], fill=color)
        if rim is not None and 0 <= ty < H:
            px[x, ty] = rim


# --- 3) medium rounded rock layer with a central hump ------------------------
mid = [float(H)] * W                                  # topY (H = no rock)
MOUNDS = [(W * 0.50, 62, H * 0.34), (W * 0.16, 42, H * 0.22),
          (W * 0.84, 46, H * 0.24), (W * 0.34, 34, H * 0.18),
          (W * 0.64, 32, H * 0.17)]
for cx, r, peak in MOUNDS:
    for x in range(int(cx - r), int(cx + r) + 1):
        dx = x - cx
        if abs(dx) <= r:
            h = peak * math.sqrt(max(0.0, 1 - (dx / r) ** 2))
            ty = H - h
            xi = x % W
            if ty < mid[xi]:
                mid[xi] = ty
fill_below(mid, MIDROCK, rim=mix(MIDROCK, EDGE, 0.28))


# --- 4) rounded stalactite ceiling: bulbous lobes + tapered drips -------------
ceil = [H * 0.085] * W
lrnd = random.Random(5)
for i in range(11):                                   # rounded downward lobes
    cx = (i + 0.5) * W / 11 + lrnd.uniform(-8, 8)
    r = lrnd.uniform(13, 28)
    top = H * 0.03 + lrnd.uniform(-3, 5)
    for x in range(int(cx - r), int(cx + r) + 1):
        dx = x - cx
        if abs(dx) <= r:
            depth = top + math.sqrt(r * r - dx * dx)
            xi = x % W
            if depth > ceil[xi]:
                ceil[xi] = depth
drnd = random.Random(13)
for _ in range(15):                                   # chunky tapered stalactites
    cx = drnd.uniform(0, W)
    w = drnd.uniform(3, 7)
    length = drnd.uniform(H * 0.10, H * 0.30)
    pointy = drnd.uniform(1.5, 3.0)
    for x in range(int(cx - w) - 1, int(cx + w) + 2):
        d = abs(x - cx) / w
        if d < 1.0:
            depth = H * 0.085 + length * (1 - d) ** pointy
            xi = x % W
            if depth > ceil[xi]:
                ceil[xi] = depth
for _ in range(5):                                    # a few long thin drips
    cx = drnd.uniform(0, W)
    w = drnd.uniform(1.2, 2.4)
    length = drnd.uniform(H * 0.32, H * 0.55)
    for x in range(int(cx - w), int(cx + w) + 1):
        d = abs(x - cx) / max(w, 0.6)
        if d < 1.0:
            depth = H * 0.085 + length * (1 - d)
            xi = x % W
            if depth > ceil[xi]:
                ceil[xi] = depth
fill_above(ceil, C_CEIL, rim=mix(C_CEIL, EDGE, 0.22))


# --- 5) foreground: two jagged rocky spires + lumpy rounded base --------------
base_h = H * 0.05
fg = [base_h] * W
mrnd = random.Random(21)
for i in range(8):                                    # rounded base mounds
    cx = (i + 0.5) * W / 8 + mrnd.uniform(-10, 10)
    r = mrnd.uniform(16, 32)
    for x in range(int(cx - r), int(cx + r) + 1):
        dx = x - cx
        if abs(dx) <= r:
            h = base_h + math.sqrt(r * r - dx * dx) * 0.62
            xi = x % W
            if h > fg[xi]:
                fg[xi] = h


def add_spire(cx, half_w, height, seed):
    """Pointed but rocky: triangular envelope perturbed by fine noise; the
    roughness fades out near the tip so the point stays sharp."""
    rough = make_noise(seed, 90)
    rough2 = make_noise(seed + 7, 40)
    for x in range(int(cx - half_w) - 2, int(cx + half_w) + 3):
        d = abs(x - cx) / half_w
        if d < 1.06:
            env = max(0.0, 1 - min(1.0, d) ** 1.5)         # pointed envelope
            r = (rough(x) - 0.5) * 0.30 + (rough2(x) - 0.5) * 0.16
            near_tip = min(1.0, d / 0.18)                  # keep the tip clean
            h = base_h + height * max(0.0, env * (1 + r * near_tip))
            xi = x % W
            if h > fg[xi]:
                fg[xi] = h


add_spire(W * 0.20, 27, H * 0.53, seed=101)               # moved positions
add_spire(W * 0.66, 31, H * 0.58, seed=202)

fg_top = [H - h for h in fg]
fill_below(fg_top, C_FORE, rim=mix(C_FORE, EDGE, 0.16))


# --- 6) crystals: small twinkles embedded in the dark rock -------------------
def add_glow(cx, cy, radius, tint, strength):
    x0, x1 = max(0, int(cx - radius)), min(W, int(cx + radius) + 1)
    y0, y1 = max(0, int(cy - radius)), min(H, int(cy + radius) + 1)
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            dd = math.hypot(xx - cx, yy - cy) / radius
            if dd < 1.0:
                f = (1 - dd) ** 2 * strength
                r, g, b = px[xx, yy]
                px[xx, yy] = (clamp(r + tint[0] * f),
                              clamp(g + tint[1] * f),
                              clamp(b + tint[2] * f))


def is_dark(x, y):
    r, g, b = px[x, y]
    return (r + g + b) < 110


def crystal(x, y, rnd, pal):
    core, body, dark, glow = pal
    roll = rnd.random()
    if roll < 0.6:
        put(x, y, glow)
        if rnd.random() < 0.45:
            dx, dy = rnd.choice(((1, 0), (-1, 0), (0, 1), (0, -1)))
            put(x + dx, y + dy, body)
    elif roll < 0.9:
        put(x, y, glow)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            put(x + dx, y + dy, body)
    else:
        add_glow(x, y, 6, glow, 0.55)
        put(x, y, core)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            put(x + dx, y + dy, body)
        for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            put(x + dx, y + dy, dark)


PALS = [GEM_EMER, GEM_EMER, GEM_TEAL, GEM_LIME]
srnd = random.Random(77)

for sx in (W * 0.20, W * 0.66):                       # clusters at spire bases
    for _ in range(15):
        x = int(sx + srnd.uniform(-22, 22))
        if 0 <= x < W:
            y = int(H - fg[x] + srnd.uniform(-4, 30))
            if 0 <= y < H and is_dark(x, y):
                crystal(x, y, srnd, srnd.choice(PALS))

placed, attempts = 0, 0                               # scattered ceiling + ground
while placed < 95 and attempts < 5000:
    attempts += 1
    x = srnd.randint(2, W - 3)
    y = srnd.choice([srnd.randint(2, int(H * 0.22)),
                     srnd.randint(int(H * 0.58), H - 3)])
    if is_dark(x, y):
        crystal(x, y, srnd, srnd.choice(PALS))
        placed += 1

for _ in range(22):                                   # faint air motes
    x = srnd.randint(0, W - 1)
    y = srnd.randint(int(H * 0.14), int(H * 0.5))
    r, g, b = px[x, y]
    px[x, y] = (clamp(r + 30), clamp(g + 40), clamp(b + 34))


# --- upscale 2x (nearest) for chunky pixels, save ----------------------------
out = img.resize((W * SCALE, H * SCALE), Image.NEAREST)
out.save("Images/amethyst_hollow_bg.png")
print("wrote Images/amethyst_hollow_bg.png", out.size)
