// Web Audio synth SFX. No asset files. One shared AudioContext, created lazily on the
// first playSfx() and resumed then (browsers allow it after a user gesture). Every sound
// is a short synth (oscillators + filtered white noise + a gain envelope). Final gain is
//   base[name] * (opts.volume ?? 1) * prefs.sfxVolume   (clamped 0..1).
// Nothing here ever throws if Web Audio is missing/blocked.

import { prefs } from './prefs.js';

export const SOUNDS = ['swordSwing', 'splat', 'landStone', 'landWall', 'landHoney', 'coin', 'star', 'uiClick'];

// Per-sound base loudness (pre user-volume). Tuned so nothing clips when stacked.
const BASE = {
  swordSwing: 0.35,
  splat: 0.6,
  landStone: 0.5,
  landWall: 0.55,
  landHoney: 0.4,
  coin: 0.4,
  star: 0.35,
  uiClick: 0.25,
};

let _ctx = null;        // shared AudioContext (null until first successful play)
let _noise = null;      // cached 1s white-noise buffer
let _dead = false;      // true once we know Web Audio is unusable
let _resumeWarned = false;  // only warn once if resume() keeps failing

// Clamp to 0..1. Non-finite input (NaN/undefined/Infinity) collapses to 0 so a bad
// opts.volume or prefs value can never leak a NaN gain into the audio graph.
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

// Lazily make + resume the context. Returns null if Web Audio is unavailable.
function ctx() {
  if (_dead) return null;
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { _dead = true; return null; }
    try { _ctx = new AC(); } catch (e) { _dead = true; return null; }
  }
  if (_ctx.state === 'suspended') {
    // resume() may throw synchronously or reject its returned promise (e.g. no user
    // gesture yet). Either way we keep going and return the ctx, but surface a one-time
    // warning so "audio is silent" is diagnosable instead of swallowed without a trace.
    try {
      const p = _ctx.resume();
      if (p && typeof p.catch === 'function') {
        p.catch((e) => {
          if (!_resumeWarned) { _resumeWarned = true; console.warn('[audio] AudioContext.resume() rejected; SFX may stay silent until a user gesture.', e); }
        });
      }
    } catch (e) {
      if (!_resumeWarned) { _resumeWarned = true; console.warn('[audio] AudioContext.resume() threw; SFX may stay silent.', e); }
    }
  }
  return _ctx;
}

// A 1-second mono white-noise buffer, built once and reused by every noisy sound.
function noiseBuffer(c) {
  if (_noise) return _noise;
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  _noise = buf;
  return _noise;
}

function noiseSource(c, rate = 1) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  src.playbackRate.value = rate;
  return src;
}

// Linear attack -> exponential-ish decay envelope on a GainNode.
function env(c, node, t0, peak, attack, dur) {
  const g = node.gain;
  g.setValueAtTime(0.0001, t0);
  g.linearRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

export function playSfx(name, opts = {}) {
  const base = BASE[name];
  if (base === undefined) {                  // unknown sound (likely a typo) -> no-op
    console.warn('[audio] playSfx: unknown sound name "' + name + '". Known:', SOUNDS.join(', '));
    return;
  }
  const c = ctx();
  if (!c) return;                            // no audio -> silent, never throws

  const rate = opts.rate ?? 1;
  const vol = clamp01(base * (opts.volume ?? 1) * prefs.sfxVolume);
  if (vol <= 0) return;

  try {
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.value = vol;
    out.connect(c.destination);

    switch (name) {
      // Quick filtered-noise "whoosh" (~140ms): band-pass noise sweeping up then down.
      case 'swordSwing': {
        const dur = 0.14 / rate;
        const n = noiseSource(c, rate);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(700 * rate, t);
        bp.frequency.linearRampToValueAtTime(2600 * rate, t + dur * 0.45);
        bp.frequency.linearRampToValueAtTime(500 * rate, t + dur);
        const g = c.createGain();
        env(c, g, t, 0.9, 0.012, dur);
        n.connect(bp).connect(g).connect(out);
        n.start(t); n.stop(t + dur + 0.02);
        break;
      }

      // Punchy noise burst + low thump (~180ms).
      case 'splat': {
        const dur = 0.18 / rate;
        // noise burst through a falling low-pass
        const n = noiseSource(c, rate);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3500 * rate, t);
        lp.frequency.exponentialRampToValueAtTime(400 * rate, t + dur);
        const ng = c.createGain();
        env(c, ng, t, 1.0, 0.004, dur * 0.8);
        n.connect(lp).connect(ng).connect(out);
        n.start(t); n.stop(t + dur + 0.02);
        // low thump body
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(180 * rate, t);
        o.frequency.exponentialRampToValueAtTime(55 * rate, t + dur);
        const og = c.createGain();
        env(c, og, t, 0.9, 0.005, dur);
        o.connect(og).connect(out);
        o.start(t); o.stop(t + dur + 0.02);
        break;
      }

      // Short low thud (stone).
      case 'landStone': {
        const dur = 0.12 / rate;
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(150 * rate, t);
        o.frequency.exponentialRampToValueAtTime(60 * rate, t + dur);
        const og = c.createGain();
        env(c, og, t, 0.9, 0.004, dur);
        o.connect(og).connect(out);
        o.start(t); o.stop(t + dur + 0.02);
        // tiny noise click for grit
        const n = noiseSource(c, rate);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1200 * rate;
        const ng = c.createGain();
        env(c, ng, t, 0.35, 0.002, dur * 0.4);
        n.connect(lp).connect(ng).connect(out);
        n.start(t); n.stop(t + dur);
        break;
      }

      // Slightly higher/harder thud (wall).
      case 'landWall': {
        const dur = 0.11 / rate;
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(230 * rate, t);
        o.frequency.exponentialRampToValueAtTime(95 * rate, t + dur);
        const og = c.createGain();
        env(c, og, t, 0.9, 0.003, dur);
        o.connect(og).connect(out);
        o.start(t); o.stop(t + dur + 0.02);
        // harder noise transient, brighter than stone
        const n = noiseSource(c, rate);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.8;
        bp.frequency.value = 2200 * rate;
        const ng = c.createGain();
        env(c, ng, t, 0.5, 0.001, dur * 0.5);
        n.connect(bp).connect(ng).connect(out);
        n.start(t); n.stop(t + dur);
        break;
      }

      // Soft muffled squelch (honey): low wobbly sine + heavily low-passed soft noise.
      case 'landHoney': {
        const dur = 0.2 / rate;
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(120 * rate, t);
        o.frequency.exponentialRampToValueAtTime(70 * rate, t + dur);
        const og = c.createGain();
        env(c, og, t, 0.8, 0.02, dur);   // slow attack -> muffled
        o.connect(og).connect(out);
        o.start(t); o.stop(t + dur + 0.02);
        const n = noiseSource(c, rate);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(700 * rate, t);
        lp.frequency.exponentialRampToValueAtTime(250 * rate, t + dur);
        const ng = c.createGain();
        env(c, ng, t, 0.35, 0.02, dur);
        n.connect(lp).connect(ng).connect(out);
        n.start(t); n.stop(t + dur + 0.02);
        break;
      }

      // Bright two-tone blip (coin).
      case 'coin': {
        const dur = 0.12 / rate;
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(880 * rate, t);
        o.frequency.setValueAtTime(1320 * rate, t + 0.05 / rate);
        const og = c.createGain();
        env(c, og, t, 0.6, 0.002, dur);
        o.connect(og).connect(out);
        o.start(t); o.stop(t + dur + 0.02);
        break;
      }

      // Rising arpeggio (star): four square-wave notes.
      case 'star': {
        const notes = [523.25, 659.25, 783.99, 1046.5];   // C5 E5 G5 C6
        const step = 0.06 / rate;
        const each = 0.09 / rate;
        notes.forEach((f, i) => {
          const o = c.createOscillator();
          o.type = 'square';
          o.frequency.value = f * rate;
          const og = c.createGain();
          const ti = t + i * step;
          env(c, og, ti, 0.5, 0.004, each);
          o.connect(og).connect(out);
          o.start(ti); o.stop(ti + each + 0.02);
        });
        break;
      }

      // Tiny tick (uiClick).
      case 'uiClick': {
        const dur = 0.04 / rate;
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(1200 * rate, t);
        o.frequency.exponentialRampToValueAtTime(600 * rate, t + dur);
        const og = c.createGain();
        env(c, og, t, 0.5, 0.001, dur);
        o.connect(og).connect(out);
        o.start(t); o.stop(t + dur + 0.01);
        break;
      }

      // Defensive: a name in BASE but with no synth case here would otherwise play nothing
      // silently. Disconnect the unused out node and warn so the gap is caught in dev.
      default: {
        out.disconnect();
        console.warn('[audio] playSfx: no synth case for "' + name + '" (it is in BASE but unhandled).');
        break;
      }
    }
  } catch (e) { /* never let audio break gameplay */ }
}
