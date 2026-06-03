// Region-based recolor for the knight. The figure is one near-neutral gray ramp, so we segment
// each animation frame spatially into HEAD (upper portion), BODY (lower portion) and the held
// SWORD blade (a thin protrusion anchored at the orange hilt). Black outline and the saturated
// orange (face + sword grip) are left untouched. Region maps are computed once and cached;
// recoloring then just applies the three chosen colors while preserving each pixel's lightness.

const KEEP = 0, HEAD = 1, BODY = 2, SWORD = 3;
// The masked knight is a big-headed chibi: the helmet (dome + visor + chin/jaw guard) runs ~3/4 of
// the figure's height. The mask means the face is black slits (not orange), so the orange-face
// anchor below almost never fires and this fraction governs the split on its own. 0.56 cut straight
// through the visor and left the gray chin beneath it in BODY, so a head recolor stopped at the dome
// and the chin tracked the body color instead. 0.72 reaches the lowest jaw row, stopping just above
// the arm/shoulder line: the whole helmet incl. the bottom of the chin is HEAD, torso/arms are BODY.
// (Going further, ~0.78+, starts tinting the pauldrons with the head color.)
const HEAD_FRAC   = 0.72; // HEAD = the whole helmet incl. chin (top ~72% of the gray bbox); shoulders/torso below are BODY
const CHIN_DROP   = 3;    // when a real orange face exists, extend HEAD this many px below faceMaxY to include the gray chin
const HEAD_CAP_FR = 0.88; // absolute ceiling: HEAD can never exceed this fraction of the gray bbox (guards curled poses)

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2; const d = mx - mn;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (mx) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// Classify each pixel of a sprite sheet into KEEP/HEAD/BODY/SWORD. Returns Uint8Array (per pixel).
export function computeRegions(px, W, H, frames) {
  const map = new Uint8Array(W * H);
  const I = (x, y) => (y * W + x) * 4;
  const isGray = (r, g, b) => {
    if (0.299 * r + 0.587 * g + 0.114 * b < 30) return false; // black outline
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return (mx ? (mx - mn) / mx : 0) < 0.30;                   // low saturation
  };
  for (const fr of frames) {
    // 1. centroids + sword tip (farthest opaque from body centroid).
    //    Also track the saturated (orange face/grip) vertical range to anchor the head split.
    let bx = 0, by = 0, bn = 0, hx = 0, hy = 0, hn = 0;
    let oMinY = Infinity, oMaxY = -Infinity;
    for (let y = fr.y; y < fr.y + fr.h; y++) for (let x = fr.x; x < fr.x + fr.w; x++) {
      const i = I(x, y); if (px[i + 3] === 0) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      bx += x; by += y; bn++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if ((mx ? (mx - mn) / mx : 0) >= 0.30) {
        hx += x; hy += y; hn++;
        if (y < oMinY) oMinY = y; if (y > oMaxY) oMaxY = y;
      }
    }
    if (bn === 0) continue;
    bx /= bn; by /= bn;
    let dx = 0, dy = 0, len = 0, hasSword = false;
    if (hn > 0) {
      hx /= hn; hy /= hn;
      let tx = hx, ty = hy, best = -1;
      for (let y = fr.y; y < fr.y + fr.h; y++) for (let x = fr.x; x < fr.x + fr.w; x++) {
        const i = I(x, y); if (px[i + 3] === 0) continue;
        const d = (x - bx) * (x - bx) + (y - by) * (y - by);
        if (d > best) { best = d; tx = x; ty = y; }
      }
      dx = tx - hx; dy = ty - hy; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      len = dl + 2;
      if (len >= 5 && len <= 18) {
        // thinness guard: flanks (±4 perp) should be transparent for a real blade
        let solid = 0, samp = 0;
        for (let t = 0.3; t <= 0.9; t += 0.15) {
          const cx = hx + dx * len * t, cy = hy + dy * len * t;
          for (const sgn of [-1, 1]) {
            const fx = Math.round(cx + (-dy) * sgn * 4), fy = Math.round(cy + dx * sgn * 4);
            samp++;
            if (fx >= fr.x && fx < fr.x + fr.w && fy >= fr.y && fy < fr.y + fr.h && px[I(fx, fy) + 3] > 0) solid++;
          }
        }
        hasSword = !(samp > 0 && solid / samp > 0.4);
      }
    }
    const inBand = (x, y) => {
      if (!hasSword) return false;
      const rx = x - hx, ry = y - hy;
      const proj = rx * dx + ry * dy, perp = Math.abs(rx * (-dy) + ry * dx);
      return proj >= -1.5 && proj <= len && perp <= 2.5;
    };
    // 2. head/body split. Track the gray extent (for fallback) AND the FACE extent —
    //    saturated pixels that are NOT in the sword band, so the orange sword grip (which sits
    //    low at the hand) can't drag the split down into the legs and over-extend the head.
    let minY = Infinity, maxY = -Infinity;
    let faceMinY = Infinity, faceMaxY = -Infinity;
    for (let y = fr.y; y < fr.y + fr.h; y++) for (let x = fr.x; x < fr.x + fr.w; x++) {
      const i = I(x, y); if (px[i + 3] === 0) continue;
      if (inBand(x, y)) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (isGray(r, g, b)) {
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if ((mx ? (mx - mn) / mx : 0) >= 0.30) { if (y < faceMinY) faceMinY = y; if (y > faceMaxY) faceMaxY = y; }
      }
    }
    // Anchor the split just below the FACE: helmet + face (gray at/above) = HEAD; torso/legs = BODY.
    // Fall back to the gray-box fraction when a frame has no face pixels to anchor against.
    const span    = maxY - minY;
    const headCap = minY + HEAD_CAP_FR * span;          // absolute ceiling
    // A genuine face/visor starts HIGH on the figure. A low orange blob is the sword GRIP at the
    // hand (e.g. the attack-thrust frame), which must NOT anchor the split — otherwise faceFloor
    // pushes splitY down and tints a leg row with the HEAD color. Require the face to begin in the
    // top half before trusting it; otherwise fall back to the chin-inclusive fraction.
    const realFace = (faceMaxY >= faceMinY) && (faceMinY <= minY + 0.5 * span);
    let splitY;
    if (realFace) {
      const faceFloor = faceMaxY + CHIN_DROP;            // face is ALWAYS head; chin sits just below it
      splitY = Math.max(minY + HEAD_FRAC * span, faceFloor);
    } else {
      splitY = minY + HEAD_FRAC * span;                  // no real face (open helmet / low grip): chin-inclusive fraction
    }
    splitY = Math.min(splitY, maxY, headCap);            // never past the figure or the cap
    // 3. assign regions
    for (let y = fr.y; y < fr.y + fr.h; y++) for (let x = fr.x; x < fr.x + fr.w; x++) {
      const i = I(x, y); if (px[i + 3] === 0) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (!isGray(r, g, b)) { map[y * W + x] = KEEP; continue; } // black outline + orange (face/grip)
      if (inBand(x, y)) map[y * W + x] = SWORD;
      else map[y * W + x] = (y < splitY) ? HEAD : BODY;
    }
  }
  return map;
}

// Apply the three colors using a precomputed region map, preserving each pixel's lightness.
export function applyRegionColors(src, dst, map, W, colors) {
  const hsl = {
    [HEAD]: hexToHsl(colors.headColor),
    [BODY]: hexToHsl(colors.bodyColor),
    [SWORD]: hexToHsl(colors.swordColor),
  };
  for (let p = 0; p < map.length; p++) {
    const i = p * 4, a = src[i + 3];
    dst[i + 3] = a;
    if (a === 0) { dst[i] = dst[i + 1] = dst[i + 2] = 0; continue; }
    const region = map[p];
    if (region === KEEP) { dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; continue; }
    const lum = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
    const { h, s } = hsl[region];
    const [nr, ng, nb] = hslToRgb(h, s, lum);
    dst[i] = nr; dst[i + 1] = ng; dst[i + 2] = nb;
  }
}
