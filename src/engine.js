/*
 * Breath engine: a direct port of the Android app's core (BreathTimeline, Harmony, BreathSynth).
 * This one file runs in two places: on the page (for the dial and chord text) and inside the
 * AudioWorklet (for the sound), so the screen and the speaker always compute the same thing.
 */

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function mod12(x) { return ((x % 12) + 12) % 12; }
function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(x) { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------------------------------------
// Breath timeline
// ---------------------------------------------------------------------------------------------

const Phase = { READY: 0, INHALE: 1, HOLD_IN: 2, EXHALE: 3, HOLD_OUT: 4, DONE: 5 };

/** Sinusoidal ease-in-out: slow at the turnarounds, fastest mid-breath. */
function ease(p) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp(p, 0, 1)); }

function cycleSeconds(p) { return p.inhale + p.holdIn + p.exhale + p.holdOut; }

/**
 * Pure function of time: given seconds since the session started, where are we in the breath?
 * The session is leadIn seconds of "get ready", then whole breath cycles; a timed session always
 * finishes the breath it's in.
 */
class BreathTimeline {
  constructor(pattern, requestedSeconds, leadIn = 3.0) {
    this.pattern = pattern;
    this.leadIn = leadIn;
    this.cycleSeconds = cycleSeconds(pattern);
    if (requestedSeconds == null) {
      this.breathingSeconds = null;
      this.endTime = null;
    } else {
      const cycles = Math.max(1, Math.ceil(requestedSeconds / this.cycleSeconds - 1e-9));
      this.breathingSeconds = cycles * this.cycleSeconds;
      this.endTime = this.breathingSeconds + leadIn;
    }
  }

  /** Fills and returns [out] (reused to avoid garbage on the audio thread). */
  stateAt(t, out = {}) {
    const p = this.pattern;
    if (t < this.leadIn) {
      out.phase = Phase.READY;
      out.progress = clamp(t / this.leadIn, 0, 1);
      out.phaseRemaining = this.leadIn - t;
      out.phaseDuration = this.leadIn;
      out.lung = 0;
      out.cycle = 0;
      out.breathingElapsed = 0;
      out.breathingRemaining = this.breathingSeconds;
      return out;
    }
    const b = t - this.leadIn;
    if (this.breathingSeconds != null && b >= this.breathingSeconds) {
      out.phase = Phase.DONE;
      out.progress = 1;
      out.phaseRemaining = 0;
      out.phaseDuration = 0;
      out.lung = 0;
      out.cycle = this._cycleAt(this.breathingSeconds - 1e-6);
      out.breathingElapsed = this.breathingSeconds;
      out.breathingRemaining = 0;
      return out;
    }
    const cycle = this._cycleAt(b);
    let x = b - cycle * this.cycleSeconds;
    out.cycle = cycle;
    out.breathingElapsed = b;
    out.breathingRemaining = this.breathingSeconds == null ? null : this.breathingSeconds - b;
    const st = (phase, dur, lung) => {
      out.phase = phase;
      out.progress = dur > 0 ? clamp(x / dur, 0, 1) : 1;
      out.phaseRemaining = Math.max(0, dur - x);
      out.phaseDuration = dur;
      out.lung = lung;
      return out;
    };
    if (x < p.inhale) return st(Phase.INHALE, p.inhale, ease(x / p.inhale));
    x -= p.inhale;
    if (x < p.holdIn) return st(Phase.HOLD_IN, p.holdIn, 1);
    x -= p.holdIn;
    if (x < p.exhale) return st(Phase.EXHALE, p.exhale, 1 - ease(x / p.exhale));
    x -= p.exhale;
    return st(Phase.HOLD_OUT, p.holdOut, 0);
  }

  _cycleAt(b) { return Math.max(0, Math.floor(b / this.cycleSeconds)); }
}

// ---------------------------------------------------------------------------------------------
// Notes, spelled by letter (so A major is A C♯ E, and F♯ major's vii° is E♯ G♯ B)
// ---------------------------------------------------------------------------------------------

const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = 'CDEFGAB';

class Note {
  constructor(letter, accidental) { this.letter = letter; this.accidental = accidental; }
  get pc() { return mod12(NATURAL[this.letter] + this.accidental); }
  up(steps, semitones) {
    const l = (this.letter + steps) % 7;
    const target = mod12(this.pc + semitones);
    let acc = mod12(target - NATURAL[l]);
    if (acc > 6) acc -= 12;
    return new Note(l, acc);
  }
  equals(o) { return o && o.letter === this.letter && o.accidental === this.accidental; }
  toString() {
    const a = { '-2': '♭♭', '-1': '♭', '1': '♯', '2': '♯♯' }[this.accidental] || '';
    return LETTERS[this.letter] + a;
  }
  static parse(name) {
    const l = LETTERS.indexOf(name[0]);
    let acc = 0;
    for (const c of name.slice(1)) acc += c === '♭' ? -1 : c === '♯' ? 1 : 0;
    return new Note(l, acc);
  }
}

const parseAll = (s) => s.split(' ').map(Note.parse);
/** Usual names for roots outside a key: flats for major-type chords… */
const FLAT_ROOTS = parseAll('C D♭ D E♭ E F G♭ G A♭ A B♭ B');
/** …and the more common choice for minor-type chords (F♯m, not G♭m). */
const MINOR_ROOTS = parseAll('C C♯ D E♭ E F F♯ G G♯ A B♭ B');
const MAJOR_KEYS = parseAll('C D♭ D E♭ E F F♯ G A♭ A B♭ B');
const MINOR_KEYS = parseAll('C C♯ D E♭ E F F♯ G G♯ A B♭ B');

// ---------------------------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------------------------

const Q = (intervals, symbol, title) => ({
  intervals, steps: intervals.length === 4 ? [0, 2, 4, 6] : [0, 2, 4], symbol, title,
  isSeventh: intervals.length === 4,
});

const Quality = {
  MAJOR: Q([0, 4, 7], '', 'Major'),
  MINOR: Q([0, 3, 7], 'm', 'Minor'),
  DIMINISHED: Q([0, 3, 6], '°', 'Diminished'),
  AUGMENTED: Q([0, 4, 8], '+', 'Augmented'),
  DOMINANT7: Q([0, 4, 7, 10], '7', 'Dominant 7'),
  MAJOR7: Q([0, 4, 7, 11], 'maj7', 'Major 7'),
  MINOR7: Q([0, 3, 7, 10], 'm7', 'Minor 7'),
  HALF_DIMINISHED7: Q([0, 3, 6, 10], 'm7♭5', 'Half-diminished 7'),
  DIMINISHED7: Q([0, 3, 6, 9], '°7', 'Diminished 7'),
  MINOR_MAJOR7: Q([0, 3, 7, 11], 'm(maj7)', 'Minor-major 7'),
  AUGMENTED_MAJOR7: Q([0, 4, 8, 11], '+maj7', 'Augmented-major 7'),
};
for (const k of Object.keys(Quality)) Quality[k].id = k;

class Chord {
  constructor(root, quality) {
    this.root = root;
    this.quality = quality;
    this.tones = quality.intervals.map((iv, i) => root.up(quality.steps[i], iv));
    this.pitchClasses = this.tones.map((n) => n.pc);
  }
  get name() { return this.root.toString() + this.quality.symbol; }
}

// ---------------------------------------------------------------------------------------------
// Settings and programs
// ---------------------------------------------------------------------------------------------

const CIRCLE_QUALITIES = {
  MAJOR: [Quality.MAJOR],
  MINOR: [Quality.MINOR],
  MAJOR_MINOR: [Quality.MAJOR, Quality.MINOR],
  DOMINANT7: [Quality.DOMINANT7],
  MAJOR7: [Quality.MAJOR7],
  MINOR7: [Quality.MINOR7],
  HALF_DIMINISHED7: [Quality.HALF_DIMINISHED7],
  DIMINISHED7: [Quality.DIMINISHED7],
  MINOR_MAJOR7: [Quality.MINOR_MAJOR7],
  AUGMENTED_MAJOR7: [Quality.AUGMENTED_MAJOR7],
};

const HARMONY_DEFAULTS = {
  program: 'CIRCLE', // DRONE | CIRCLE | IN_KEY
  timing: 'HALF_BREATH', // HALF_BREATH | BREATH
  circleQuality: 'MAJOR',
  keyRoot: 0,
  keyMode: 'MAJOR',
  sevenths: false,
  tourKeys: false,
  bass: 'ROOTS', // ROOTS | SMOOTH
  blend: 0.35,
  focus: 'OFF', // OFF | WANDER | THIRD | SEVENTH | ROOT
  focusDepth: 0.6,
  focusSeed: 0,
};

const QUICK_BLEND = 0.15;
function blendSeconds(h, inhale, exhale) {
  const longest = 0.8 * Math.min(inhale, exhale);
  return Math.max(QUICK_BLEND, QUICK_BLEND + clamp(h.blend, 0, 1) * (longest - QUICK_BLEND));
}

const D = (degree, quality, roman) => ({ degree, quality, roman });
const DEGREES = {
  'MAJOR/false': [D(0, Quality.MAJOR, 'I'), D(3, Quality.MAJOR, 'IV'), D(6, Quality.DIMINISHED, 'vii°'), D(2, Quality.MINOR, 'iii'), D(5, Quality.MINOR, 'vi'), D(1, Quality.MINOR, 'ii'), D(4, Quality.MAJOR, 'V')],
  'MAJOR/true': [D(0, Quality.MAJOR7, 'Imaj7'), D(3, Quality.MAJOR7, 'IVmaj7'), D(6, Quality.HALF_DIMINISHED7, 'viiø7'), D(2, Quality.MINOR7, 'iii7'), D(5, Quality.MINOR7, 'vi7'), D(1, Quality.MINOR7, 'ii7'), D(4, Quality.DOMINANT7, 'V7')],
  // Minor: natural minor, except V is major (harmonic minor) so it pulls home.
  'MINOR/false': [D(0, Quality.MINOR, 'i'), D(3, Quality.MINOR, 'iv'), D(6, Quality.MAJOR, 'VII'), D(2, Quality.MAJOR, 'III'), D(5, Quality.MAJOR, 'VI'), D(1, Quality.DIMINISHED, 'ii°'), D(4, Quality.MAJOR, 'V')],
  'MINOR/true': [D(0, Quality.MINOR7, 'i7'), D(3, Quality.MINOR7, 'iv7'), D(6, Quality.DOMINANT7, 'VII7'), D(2, Quality.MAJOR7, 'IIImaj7'), D(5, Quality.MAJOR7, 'VImaj7'), D(1, Quality.HALF_DIMINISHED7, 'iiø7'), D(4, Quality.DOMINANT7, 'V7')],
};
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const ROUNDS_PER_KEY = 2;
const MINORISH = new Set([Quality.MINOR, Quality.MINOR7, Quality.HALF_DIMINISHED7, Quality.DIMINISHED7, Quality.MINOR_MAJOR7, Quality.DIMINISHED]);

/** Pure mapping from the breath to the harmony: which chord slot a moment belongs to, and which chord sits there. */
class HarmonyPlan {
  constructor(settings) { this.settings = settings; }

  /** Slot index for this moment; -1 once the session is done (keep what's sounding). */
  slotFor(s) {
    const half = this.settings.timing === 'HALF_BREATH';
    switch (s.phase) {
      case Phase.READY: return 0;
      case Phase.DONE: return -1;
      case Phase.INHALE: case Phase.HOLD_IN: return half ? s.cycle * 2 : s.cycle;
      default: return half ? s.cycle * 2 + 1 : s.cycle;
    }
  }

  /** Seconds since the current slot's chord began; Infinity when there is no change to show. */
  secondsIntoSlot(s, p) {
    const elapsed = s.phaseDuration - s.phaseRemaining;
    const half = this.settings.timing === 'HALF_BREATH';
    switch (s.phase) {
      case Phase.READY: case Phase.DONE: return Infinity;
      case Phase.INHALE: return elapsed;
      case Phase.HOLD_IN: return p.inhale + elapsed;
      case Phase.EXHALE: return half ? elapsed : p.inhale + p.holdIn + elapsed;
      default: return half ? p.exhale + elapsed : p.inhale + p.holdIn + p.exhale + elapsed;
    }
  }

  chordAt(slot) {
    const n = Math.max(0, slot);
    switch (this.settings.program) {
      case 'DRONE': return { chord: new Chord(Note.parse('D'), Quality.MAJOR), roman: null, key: null };
      case 'CIRCLE': return this._circle(n);
      default: return this._inKey(n);
    }
  }

  _circle(n) {
    const qs = CIRCLE_QUALITIES[this.settings.circleQuality];
    const step = Math.floor(n / qs.length);
    const quality = qs[n % qs.length];
    const pc = mod12(this.settings.keyRoot + 5 * step);
    const minorish = MINORISH.has(quality);
    const preferred = (minorish ? MINOR_ROOTS : FLAT_ROOTS)[pc];
    const other = (minorish ? FLAT_ROOTS : MINOR_ROOTS)[pc];
    // On a black key, use whichever spelling reads more easily (fewer accidentals in the chord).
    const cost = (root) => new Chord(root, quality).tones.reduce((a, t) => a + Math.abs(t.accidental), 0);
    const root = cost(other) < cost(preferred) ? other : preferred;
    return { chord: new Chord(root, quality), roman: null, key: null };
  }

  _inKey(n) {
    const s = this.settings;
    const degrees = DEGREES[`${s.keyMode}/${!!s.sevenths}`];
    const perKey = degrees.length * ROUNDS_PER_KEY;
    const keyIndex = s.tourKeys ? Math.floor(n / perKey) : 0;
    const tonicPc = mod12(s.keyRoot + 7 * keyIndex);
    const tonic = (s.keyMode === 'MAJOR' ? MAJOR_KEYS : MINOR_KEYS)[tonicPc];
    const scale = s.keyMode === 'MAJOR' ? MAJOR_SCALE : MINOR_SCALE;
    const d = degrees[n % degrees.length];
    const root = tonic.up(d.degree, scale[d.degree]);
    return { chord: new Chord(root, d.quality), roman: d.roman, key: { tonic, mode: s.keyMode } };
  }
}

// ---------------------------------------------------------------------------------------------
// Voicing
// ---------------------------------------------------------------------------------------------

/** A chord as actually played: MIDI notes [bass, v1..v4] plus what to show. */
class Voiced {
  constructor(info, midi) {
    this.info = info;
    this.midi = midi;
    const chord = info.chord;
    const idx = (m) => Math.max(0, chord.pitchClasses.indexOf(mod12(m)));
    this.roles = midi.map(idx);
    this.inversion = idx(midi[0]);
    this.bassNote = chord.tones[this.inversion];
    this.displayName = this.inversion === 0 ? chord.name : `${chord.name}/${this.bassNote}`;
    const n = chord.tones.length;
    this.rolesFromBass = chord.tones.map((_, i) => (this.inversion + i) % n);
    this.notesFromBass = this.rolesFromBass.map((r) => chord.tones[r]);
  }
}

/**
 * Turns a stream of chords into MIDI notes: a bass plus four upper voices that move as little as
 * possible from chord to chord, kept within a comfortable register.
 */
class Voicer {
  constructor(bassMotion = 'ROOTS') {
    this.bassMotion = bassMotion;
    this.low = 52; this.high = 76; this.center = 64;
    this.bassLow = 33; this.bassHigh = 48; this.bassCenter = 40;
    this.prev = [57, 61, 65, 70];
    this.prevBass = 40;
    this.first = true;
  }

  next(chord) {
    const pcs = chord.pitchClasses;
    const bass = this._chooseBass(chord);
    const bassPc = mod12(bass);
    const required = new Set(pcs.filter((_, i) => !(chord.quality.isSeventh && i === 2 && chord.quality.intervals[2] === 7)));

    const inChord = (m) => pcs.includes(mod12(m));
    const candidates = [0, 1, 2, 3].map((v) => {
      const near = [];
      for (let m = this.low; m <= this.high; m++) if (inChord(m) && Math.abs(m - this.prev[v]) <= 7) near.push(m);
      if (near.length) return near;
      const all = [];
      for (let m = this.low; m <= this.high; m++) if (inChord(m)) all.push(m);
      return all;
    });

    let best = null;
    let bestScore = Infinity;
    const cur = [0, 0, 0, 0];
    const prev = this.prev;
    const center = this.center;
    const rootPc = chord.root.pc;
    const search = (v) => {
      if (v === 4) {
        const present = new Set(cur.map(mod12));
        present.add(bassPc);
        for (const r of required) if (!present.has(r)) return;
        let score = 0;
        for (let i = 0; i < 4; i++) score += Math.abs(cur[i] - prev[i]);
        score += 0.5 * Math.abs((cur[0] + cur[1] + cur[2] + cur[3]) / 4 - center);
        const span = cur[3] - cur[0];
        if (span > 19) score += span - 19;
        if (span < 7) score += 7 - span;
        if (bassPc !== rootPc) score += 1.5 * cur.filter((m) => mod12(m) === bassPc).length;
        if (score < bestScore) { bestScore = score; best = cur.slice(); }
        return;
      }
      for (const n of candidates[v]) {
        if (v > 0 && n <= cur[v - 1]) continue;
        cur[v] = n;
        search(v + 1);
      }
    };
    search(0);
    const upper = best || this._closePosition(chord);
    this.prev = upper;
    return [bass, upper[0], upper[1], upper[2], upper[3]];
  }

  _chooseBass(chord) {
    const root = chord.root.pc;
    const rootsOnly = this.bassMotion === 'ROOTS' || this.first;
    this.first = false;
    const allowed = new Map();
    if (rootsOnly) allowed.set(root, 0);
    else {
      const cost = [0, 2, 4.5, 3];
      chord.pitchClasses.forEach((pc, i) => allowed.set(pc, cost[i]));
    }
    let bass = null;
    let bestCost = Infinity;
    for (let m = this.bassLow; m <= this.bassHigh; m++) {
      if (!allowed.has(mod12(m))) continue;
      const c = Math.abs(m - this.prevBass) + 0.3 * Math.abs(m - this.bassCenter) + allowed.get(mod12(m));
      if (c < bestCost) { bestCost = c; bass = m; }
    }
    if (bass == null) bass = this.bassLow + root;
    this.prevBass = bass;
    return bass;
  }

  _closePosition(chord) {
    const iv = chord.quality.intervals;
    let start = this.low;
    while (mod12(start) !== chord.root.pc) start++;
    return [0, 1, 2, 3].map((i) => start + iv[i % iv.length] + 12 * Math.floor(i / iv.length));
  }
}

/** The whole session's harmony, slot by slot, voiced; replays from slot 0 and caches. */
class HarmonyTrack {
  constructor(settings) {
    this.settings = settings;
    this.plan = new HarmonyPlan(settings);
    this.voicer = new Voicer(settings.bass);
    this.cache = [];
  }
  at(slot) {
    const s = Math.max(0, slot);
    while (this.cache.length <= s) {
      const info = this.plan.chordAt(this.cache.length);
      this.cache.push(new Voiced(info, this.voicer.next(info.chord)));
    }
    return this.cache[s];
  }
}

// ---------------------------------------------------------------------------------------------
// Note focus: how loud each chord-tone role is right now, as a pure function of session time
// ---------------------------------------------------------------------------------------------

const FocusField = (() => {
  const PERIODS = [11, 13, 9, 15];
  const BOOST_DB = 6, CUT_DB = 24, SPOT_PERIOD = 20;
  const MASK = (1n << 64n) - 1n;
  const K1 = 0x9E3779B97F4A7C15n, K2 = 0xBF58476D1CE4E5B9n, K3 = 0x94D049BB133111EBn;

  // Same 64-bit hash as the Kotlin code, so Wander follows the same curve for the same seed.
  function hash(seed, channel, i) {
    let z = (BigInt(seed) * K1 + BigInt(channel) * K2 + BigInt(i) * K3) & MASK;
    z = ((z ^ (z >> 30n)) * K2) & MASK;
    z = ((z ^ (z >> 27n)) * K3) & MASK;
    z = z ^ (z >> 31n);
    return Number(z >> 11n) / 9007199254740992 * 2 - 1;
  }

  // The hash only changes every 9–15 s, so cache it per role (no BigInt work per audio block).
  const cache = [0, 1, 2, 3].map(() => ({ seed: null, i: null, a: 0, b: 0 }));
  function smoothNoise(seed, channel, x) {
    const i = Math.floor(x);
    const c = cache[channel];
    if (c.seed !== seed || c.i !== i) {
      c.seed = seed; c.i = i;
      c.a = hash(seed, channel, i);
      c.b = hash(seed, channel, i + 1);
    }
    const f = x - i;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * f);
    return c.a + (c.b - c.a) * e;
  }

  const dbToGain = (db) => Math.pow(10, db / 20);

  /** Fills [out] (size 4) with gains for root, third, fifth, seventh at time t. */
  function levels(h, t, hasSeventh, out) {
    const depth = clamp(h.focusDepth, 0, 1);
    switch (h.focus) {
      case 'WANDER': {
        for (let r = 0; r < 4; r++) {
          const n = smoothNoise(h.focusSeed, r, t / PERIODS[r]);
          out[r] = dbToGain(n > 0 ? BOOST_DB * n * depth : CUT_DB * n * depth);
        }
        const roles = hasSeventh ? 4 : 3;
        let max = 0;
        for (let r = 0; r < roles; r++) max = Math.max(max, out[r]);
        if (max < 1) for (let r = 0; r < 4; r++) out[r] /= max;
        return out;
      }
      case 'THIRD': case 'SEVENTH': case 'ROOT': {
        const target = h.focus === 'THIRD' ? 1 : h.focus === 'SEVENTH' ? 3 : 0;
        if (target === 3 && !hasSeventh) { out.fill(1); return out; }
        const p = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / SPOT_PERIOD);
        for (let r = 0; r < 4; r++) {
          out[r] = r === target ? dbToGain(depth * (3 + 7 * p)) : dbToGain(-depth * (2 + 10 * p));
        }
        return out;
      }
      default:
        out.fill(1);
        return out;
    }
  }

  return { levels, dbToGain };
})();

// ---------------------------------------------------------------------------------------------
// DSP building blocks
// ---------------------------------------------------------------------------------------------

const SINE_SIZE = 4096;
const SINE = new Float32Array(SINE_SIZE + 1);
for (let i = 0; i <= SINE_SIZE; i++) SINE[i] = Math.sin(2 * Math.PI * i / SINE_SIZE);
function sineAt(phase) {
  const idx = phase * SINE_SIZE;
  const i = idx | 0;
  const a = SINE[i];
  return a + (SINE[i + 1] - a) * (idx - i);
}

class Smoother {
  constructor(timeSeconds, rate, initial = 0) {
    this.coef = Math.exp(-1 / (timeSeconds * rate));
    this.value = initial;
  }
  next(target) { this.value = target + (this.value - target) * this.coef; return this.value; }
}

/** Pink-ish noise (Paul Kellet's economy filter) over xorshift32 white noise. */
class PinkNoise {
  constructor(seed) { this.s = seed | 0 || 1; this.b0 = 0; this.b1 = 0; this.b2 = 0; }
  white() {
    let x = this.s;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x | 0;
    return (x >>> 0) / 4294967296 * 2 - 1;
  }
  next() {
    const w = this.white();
    this.b0 = 0.99765 * this.b0 + w * 0.0990460;
    this.b1 = 0.96300 * this.b1 + w * 0.2965164;
    this.b2 = 0.57000 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.2;
  }
}

/** TPT state-variable filter, lowpass output. */
class SvfLowpass {
  constructor(sr) { this.sr = sr; this.ic1 = 0; this.ic2 = 0; this.a1 = 0; this.a2 = 0; this.a3 = 0; }
  set(cutoffHz, q) {
    const g = Math.tan(Math.PI * clamp(cutoffHz, 20, this.sr * 0.45) / this.sr);
    const k = 1 / q;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  process(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }
}

/** Freeverb-style stereo reverb, tunings scaled from 44.1 kHz. */
class Reverb {
  constructor(sr, roomSize = 0.84, damping = 0.55) {
    const scale = sr / 44100;
    const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const apT = [556, 441, 341, 225];
    const spread = 23;
    this.feedback = roomSize * 0.28 + 0.7;
    this.damp = damping * 0.4;
    const mk = (n) => ({ buf: new Float32Array(Math.max(1, Math.floor(n))), idx: 0, store: 0 });
    this.combsL = combT.map((t) => mk(t * scale));
    this.combsR = combT.map((t) => mk((t + spread) * scale));
    this.apsL = apT.map((t) => mk(t * scale));
    this.apsR = apT.map((t) => mk((t + spread) * scale));
    this.outL = 0; this.outR = 0;
  }
  _comb(c, input) {
    const out = c.buf[c.idx];
    c.store = out * (1 - this.damp) + c.store * this.damp + 1e-20;
    c.buf[c.idx] = input + c.store * this.feedback;
    if (++c.idx >= c.buf.length) c.idx = 0;
    return out;
  }
  _allpass(a, input) {
    const bufOut = a.buf[a.idx];
    a.buf[a.idx] = input + bufOut * 0.5;
    if (++a.idx >= a.buf.length) a.idx = 0;
    return bufOut - input;
  }
  process(input) {
    const x = input * 0.015;
    let l = 0, r = 0;
    for (let i = 0; i < 8; i++) { l += this._comb(this.combsL[i], x); r += this._comb(this.combsR[i], x); }
    for (let i = 0; i < 4; i++) { l = this._allpass(this.apsL[i], l); r = this._allpass(this.apsR[i], r); }
    this.outL = l; this.outR = r;
  }
}

/** Transparent below 0.7, gently saturating above, never exceeds ±1. */
function softClip(x) {
  const a = Math.abs(x);
  if (a <= 0.7) return x;
  const y = 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3);
  return x < 0 ? -y : y;
}

/** Band-limited sawtooth (PolyBLEP), phase t in 0..1, increment dt. */
function polyBlepSaw(t, dt) {
  let y = 2 * t - 1;
  if (t < dt) { const x = t / dt; y -= x + x - x * x - 1; }
  else if (t > 1 - dt) { const x = (t - 1) / dt; y -= x * x + x + x + 1; }
  return y;
}

const CONTROL_BLOCK = 32;

// ---------------------------------------------------------------------------------------------
// The pad: lanes of detuned saw pairs through a soft 4-pole lowpass; breath swells and brightens it
// ---------------------------------------------------------------------------------------------

class ChordPad {
  constructor(sr, laneLevel, lanePan, crossfadeSeconds) {
    this.sr = sr;
    this.laneLevel = laneLevel;
    this.lanePan = lanePan;
    const L = laneLevel.length;
    this.lanes = L;
    this.detune = [Math.pow(2, -4 / 1200), Math.pow(2, 4 / 1200)];
    this.note = []; this.role = []; this.focusGain = []; this.phase = []; this.inc = [];
    this.gain = []; this.gainTarget = []; this.active = new Int32Array(L);
    for (let l = 0; l < L; l++) {
      this.note.push([-1, -1]);
      this.role.push([0, 0]);
      this.focusGain.push([1, 1]);
      this.phase.push([0, 1].map((s) => new Float64Array([0, 1].map((v) => (l * 0.37 + s * 0.21 + v * 0.61) % 1))));
      this.inc.push([new Float64Array(2), new Float64Array(2)]);
      this.gain.push(new Float64Array(2));
      this.gainTarget.push(new Float64Array(2));
    }
    this.focusUpper = new Float64Array([1, 1, 1, 1]);
    this.focusBass = new Float64Array([1, 1, 1, 1]);
    this.focusCoef = Math.exp(-1 / (0.3 * sr));
    this.xfStep = 1 / (Math.max(0.01, crossfadeSeconds) * sr);
    this.lp1L = new SvfLowpass(sr); this.lp2L = new SvfLowpass(sr);
    this.lp1R = new SvfLowpass(sr); this.lp2R = new SvfLowpass(sr);
    this.ampSm = new Smoother(0.12, sr, 0);
    this.ampTarget = 0;
    this.cutoffSm = new Smoother(0.08, sr / CONTROL_BLOCK, ChordPad.CUT_LO);
    this.outL = 0; this.outR = 0;
  }

  setNotes(midi, roles, immediate = false) {
    const n = Math.min(this.lanes, midi.length);
    for (let l = 0; l < n; l++) {
      const m = midi[l];
      const a = this.active[l];
      const r = roles ? roles[l] || 0 : 0;
      if (this.note[l][a] === m) { this.role[l][a] = r; continue; }
      const b = 1 - a;
      this.note[l][b] = m;
      this.role[l][b] = r;
      const hz = midiToHz(m);
      this.inc[l][b][0] = hz * this.detune[0] / this.sr;
      this.inc[l][b][1] = hz * this.detune[1] / this.sr;
      this.gainTarget[l][a] = 0;
      this.gainTarget[l][b] = 1;
      if (immediate) { this.gain[l][a] = 0; this.gain[l][b] = 1; }
      this.active[l] = b;
    }
  }

  /** Per-role gains; the bass gets half the effect (in dB) so the floor holds. */
  setFocus(levels) {
    for (let r = 0; r < 4; r++) { this.focusUpper[r] = levels[r]; this.focusBass[r] = Math.sqrt(levels[r]); }
  }

  control(s, turnaround) {
    const breathing = s.phase !== Phase.READY && s.phase !== Phase.DONE;
    this.ampTarget = breathing ? (0.38 + 0.62 * s.lung) * turnaround : 0;
    const cutoff = this.cutoffSm.next(ChordPad.CUT_LO * Math.pow(ChordPad.CUT_HI / ChordPad.CUT_LO, s.lung));
    this.lp1L.set(cutoff, 0.6); this.lp2L.set(cutoff, 0.75);
    this.lp1R.set(cutoff * 1.03, 0.6); this.lp2R.set(cutoff * 1.03, 0.75);
  }

  next() {
    let l = 0, r = 0;
    const xf = this.xfStep;
    for (let lane = 0; lane < this.lanes; lane++) {
      const focus = lane === 0 ? this.focusBass : this.focusUpper;
      const gain = this.gain[lane], gt = this.gainTarget[lane];
      let laneSum = 0;
      for (let s = 0; s < 2; s++) {
        const tgt = gt[s];
        let g = gain[s];
        if (g < tgt) g = Math.min(tgt, g + xf); else if (g > tgt) g = Math.max(tgt, g - xf);
        gain[s] = g;
        if (g <= 0) continue;
        const eg = g >= 1 ? 1 : Math.sin(g * Math.PI / 2);
        const ph = this.phase[lane][s];
        const dt = this.inc[lane][s];
        let v = 0;
        for (let k = 0; k < 2; k++) {
          v += polyBlepSaw(ph[k], dt[k]);
          let p = ph[k] + dt[k];
          if (p >= 1) p -= 1;
          ph[k] = p;
        }
        const ft = focus[this.role[lane][s]];
        const fgArr = this.focusGain[lane];
        const fg = ft + (fgArr[s] - ft) * this.focusCoef;
        fgArr[s] = fg;
        laneSum += v * eg * fg;
      }
      laneSum *= this.laneLevel[lane];
      l += laneSum * (1 - this.lanePan[lane]);
      r += laneSum * this.lanePan[lane];
    }
    const a = this.ampSm.next(this.ampTarget) * ChordPad.LEVEL;
    this.outL = this.lp2L.process(this.lp1L.process(l)) * a;
    this.outR = this.lp2R.process(this.lp1R.process(r)) * a;
  }

  static drone(sr, xf) {
    return new ChordPad(sr, [0.9, 0.75, 0.6, 0.45, 0.28, 0.18], [0.5, 0.35, 0.65, 0.3, 0.7, 0.45], xf);
  }
  static harmony(sr, xf) {
    return new ChordPad(sr, [0.85, 0.62, 0.58, 0.52, 0.45], [0.5, 0.3, 0.62, 0.4, 0.7], xf);
  }
}
ChordPad.CUT_LO = 260;
ChordPad.CUT_HI = 1500;
ChordPad.LEVEL = 0.2;
/** D2 A2 D3 A3 E4 F♯4: open fifths with a gentle ninth and third on top. */
ChordPad.DRONE_NOTES = [38, 45, 50, 57, 64, 66];

// ---------------------------------------------------------------------------------------------
// Singing bowls: a strike at each inhale (higher) and exhale (lower), a tiny chime for holds
// ---------------------------------------------------------------------------------------------

class BowlLayer {
  constructor(sr) {
    this.sr = sr;
    this.ratios = [1.0, 2.76, 5.40, 8.93];
    this.levels = [1.0, 0.45, 0.2, 0.08];
    this.t60 = [9.0, 5.5, 3.0, 1.6];
    this.beatHz = [0.35, 0.9, 1.6, 2.3];
    const P = this.ratios.length;
    this.voices = Array.from({ length: 6 }, () => ({
      phaseA: new Float64Array(P), phaseB: new Float64Array(P), incA: new Float64Array(P), incB: new Float64Array(P),
      amp: new Float64Array(P), decay: new Float64Array(P), attack: 1, attackInc: 0, pan: 0.5, active: false,
    }));
    this.nextVoice = 0;
    this.outL = 0; this.outR = 0;
  }
  onPhase(phase) {
    if (phase === Phase.INHALE) this._strike(220.0, 1.0, 0.42, 1.0);
    else if (phase === Phase.EXHALE) this._strike(146.83, 1.0, 0.58, 1.25);
    else if (phase === Phase.HOLD_IN || phase === Phase.HOLD_OUT) this._strike(587.33, 0.16, 0.5, 0.35);
  }
  _strike(f0, velocity, pan, decayScale) {
    const v = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % this.voices.length;
    for (let k = 0; k < this.ratios.length; k++) {
      const f = f0 * this.ratios[k];
      v.incA[k] = (f - this.beatHz[k] / 2) / this.sr;
      v.incB[k] = (f + this.beatHz[k] / 2) / this.sr;
      v.phaseA[k] = 0; v.phaseB[k] = 0.25;
      v.amp[k] = f < this.sr * 0.45 ? this.levels[k] * velocity : 0;
      v.decay[k] = Math.exp(-6.91 / (this.t60[k] * decayScale * this.sr));
    }
    v.attack = 0;
    v.attackInc = 1 / (0.012 * this.sr);
    v.pan = pan;
    v.active = true;
  }
  next() {
    let l = 0, r = 0;
    for (const v of this.voices) {
      if (!v.active) continue;
      if (v.attack < 1) v.attack = Math.min(1, v.attack + v.attackInc);
      let s = 0, alive = false;
      for (let k = 0; k < 4; k++) {
        const a = v.amp[k];
        if (a < 1e-5) continue;
        alive = true;
        s += (sineAt(v.phaseA[k]) + sineAt(v.phaseB[k])) * 0.5 * a;
        let pa = v.phaseA[k] + v.incA[k]; if (pa >= 1) pa -= 1; v.phaseA[k] = pa;
        let pb = v.phaseB[k] + v.incB[k]; if (pb >= 1) pb -= 1; v.phaseB[k] = pb;
        v.amp[k] = a * v.decay[k];
      }
      if (!alive) { v.active = false; continue; }
      s *= v.attack * 0.55;
      l += s * (1 - v.pan);
      r += s * v.pan;
    }
    this.outL = l; this.outR = r;
  }
}

// ---------------------------------------------------------------------------------------------
// Air: filtered pink noise, loudest mid-breath, silent in holds
// ---------------------------------------------------------------------------------------------

class AirLayer {
  constructor(sr) {
    this.noiseL = new PinkNoise(0x1234567);
    this.noiseR = new PinkNoise(0x7654321);
    this.filtL = new SvfLowpass(sr);
    this.filtR = new SvfLowpass(sr);
    this.ampSm = new Smoother(0.08, sr, 0);
    this.ampTarget = 0;
    this.cutoffSm = new Smoother(0.05, sr / CONTROL_BLOCK, 400);
    this.outL = 0; this.outR = 0;
  }
  control(s) {
    const motion = Math.sin(Math.PI * s.progress);
    this.ampTarget = s.phase === Phase.INHALE || s.phase === Phase.EXHALE ? 0.15 + 0.85 * motion : 0;
    const base = lerp(320, 1700, s.lung);
    const c = this.cutoffSm.next(s.phase === Phase.INHALE ? base * 1.25 : base * 0.8);
    this.filtL.set(c, 1.1);
    this.filtR.set(c * 1.04, 1.1);
  }
  next() {
    const a = this.ampSm.next(this.ampTarget) * 0.2;
    this.outL = this.filtL.process(this.noiseL.next()) * a;
    this.outR = this.filtR.process(this.noiseR.next()) * a;
  }
}

// ---------------------------------------------------------------------------------------------
// The whole breath sound, rendered as a function of the session frame index (the audio is the clock)
// ---------------------------------------------------------------------------------------------

class BreathSynth {
  constructor(sr, timeline, sound) {
    this.sr = sr;
    this.timeline = timeline;
    this.sound = sound;
    this.volume = sound.volume;
    const h = sound.harmony;
    this.harmony = h;
    this.track = new HarmonyTrack(h);
    this.plan = this.track.plan;
    this.isDrone = h.program === 'DRONE';
    const xf = blendSeconds(h, timeline.pattern.inhale, timeline.pattern.exhale);
    this.pad = sound.tone === 'PAD' ? (this.isDrone ? ChordPad.drone(sr, xf) : ChordPad.harmony(sr, xf)) : null;
    this.bowls = sound.tone === 'BOWLS' ? new BowlLayer(sr) : null;
    this.air = sound.air ? new AirLayer(sr) : null;
    this.reverb = new Reverb(sr);
    this.volumeSm = new Smoother(0.05, sr, this._perceptual(sound.volume));
    this.extraGain = new Smoother(0.08, sr, 1);
    this.gainTarget = 1;
    this.lastPhase = null;
    this.lastCycle = -1;
    this.lastSlot = -1;
    this.hasSeventh = false;
    this.focus = new Float64Array([1, 1, 1, 1]);
    this.state = {};
    if (this.pad && this.isDrone) this.pad.setNotes(ChordPad.DRONE_NOTES, null, true);
  }

  _perceptual(v) { const x = clamp(v, 0, 1); return x * x; }

  /** Writes frames into L/R (from index 0) for session frames startFrame ..< startFrame + frames. */
  render(L, R, startFrame, frames) {
    const sr = this.sr;
    let i = 0;
    while (i < frames) {
      const n = Math.min(CONTROL_BLOCK, frames - i);
      const t = (startFrame + i) / sr;
      const state = this.timeline.stateAt(t, this.state);
      if (state.phase !== this.lastPhase || state.cycle !== this.lastCycle) {
        if (this.bowls) this.bowls.onPhase(state.phase);
        this.lastPhase = state.phase;
        this.lastCycle = state.cycle;
      }
      if (this.pad && !this.isDrone) {
        const slot = this.plan.slotFor(state);
        if (slot >= 0 && slot !== this.lastSlot) {
          const v = this.track.at(slot);
          this.pad.setNotes(v.midi, v.roles, this.lastSlot < 0);
          this.hasSeventh = v.info.chord.quality.isSeventh;
          this.lastSlot = slot;
        }
        FocusField.levels(this.harmony, t, this.hasSeventh, this.focus);
        this.pad.setFocus(this.focus);
      }
      if (this.pad) this.pad.control(state, this._turnaroundGain(state));
      if (this.air) this.air.control(state);
      const volTarget = this._perceptual(this.volume);
      const pad = this.pad, bowls = this.bowls, air = this.air, rv = this.reverb;
      for (let j = 0; j < n; j++) {
        let l = 0, r = 0;
        if (pad) { pad.next(); l += pad.outL; r += pad.outR; }
        if (bowls) { bowls.next(); l += bowls.outL; r += bowls.outR; }
        if (air) { air.next(); l += air.outL; r += air.outR; }
        rv.process((l + r) * 0.5);
        l += rv.outL * 0.9;
        r += rv.outR * 0.9;
        const g = this.volumeSm.next(volTarget) * this.extraGain.next(this.gainTarget) * 1.6;
        L[i + j] = softClip(l * g);
        R[i + j] = softClip(r * g);
      }
      i += n;
    }
  }

  /** Where inhale meets exhale directly (no hold), dip the pad a little, like the natural pause. */
  _turnaroundGain(s) {
    if (!this.sound.softTurnaround) return 1;
    const p = this.timeline.pattern;
    const dip = Math.min(0.6, s.phaseDuration * 0.2);
    if (dip <= 0) return 1;
    const elapsed = s.phaseDuration - s.phaseRemaining;
    const atStart = s.phase === Phase.INHALE ? p.holdOut === 0 && s.cycle > 0 : s.phase === Phase.EXHALE ? p.holdIn === 0 : false;
    const atEnd = s.phase === Phase.INHALE ? p.holdIn === 0 : s.phase === Phase.EXHALE ? p.holdOut === 0 : false;
    let g = 1;
    if (atStart) g *= lerp(0.6, 1, smoothstep(elapsed / dip));
    if (atEnd) g *= lerp(0.6, 1, smoothstep(s.phaseRemaining / dip));
    return g;
  }
}

/** One session's sound: timeline + synth, driven by messages from the page. */
class SessionEngine {
  constructor(sr, config) {
    this.sr = sr;
    this.timeline = new BreathTimeline(config.pattern, config.minutes > 0 ? config.minutes * 60 : null);
    this.synth = new BreathSynth(sr, this.timeline, config.sound);
    // Reverb tail after the last breath before reporting "done".
    this.doneFrame = this.timeline.endTime == null ? Infinity : Math.round((this.timeline.endTime + 4) * sr);
    this.doneSent = false;
  }
  message(m) {
    if (m.type === 'gain') this.synth.gainTarget = m.value;
    else if (m.type === 'volume') this.synth.volume = m.value;
  }
  /** Renders a block; returns true once the session (plus tail) is over. */
  render(L, R, sessionFrame, frames) {
    if (sessionFrame + frames <= 0) { L.fill(0); R.fill(0); return false; }
    let off = 0;
    if (sessionFrame < 0) {
      off = -sessionFrame;
      L.fill(0, 0, off); R.fill(0, 0, off);
    }
    const sub = off ? [L.subarray(off), R.subarray(off)] : [L, R];
    this.synth.render(sub[0], sub[1], sessionFrame + off, frames - off);
    return sessionFrame + frames >= this.doneFrame;
  }
}

// ---------------------------------------------------------------------------------------------
// AudioWorklet registration (only when this file runs inside the audio worklet)
// ---------------------------------------------------------------------------------------------

if (typeof AudioWorkletProcessor !== 'undefined' && typeof registerProcessor !== 'undefined') {
  class BreathProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.engine = null;
      this.startFrame = 0;
      this.mono = null;
      this.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'start') {
          this.engine = new SessionEngine(sampleRate, m.config);
          this.startFrame = m.startFrame;
        } else if (m.type === 'stop') {
          this.engine = null;
        } else if (this.engine) {
          this.engine.message(m);
        }
      };
    }
    process(inputs, outputs) {
      const out = outputs[0];
      const L = out[0];
      if (!L) return true;
      let R = out[1];
      if (!R) { if (!this.mono || this.mono.length !== L.length) this.mono = new Float32Array(L.length); R = this.mono; }
      if (!this.engine) { L.fill(0); R.fill(0); return true; }
      const done = this.engine.render(L, R, currentFrame - this.startFrame, L.length);
      if (!out[1]) for (let i = 0; i < L.length; i++) L[i] = 0.5 * (L[i] + R[i]);
      if (done && !this.engine.doneSent) {
        this.engine.doneSent = true;
        this.port.postMessage({ type: 'done' });
      }
      return true;
    }
  }
  registerProcessor('breath', BreathProcessor);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Phase, BreathTimeline, Note, Chord, Quality, HarmonyPlan, HarmonyTrack, Voicer, FocusField,
    BreathSynth, SessionEngine, HARMONY_DEFAULTS, blendSeconds, mod12, MAJOR_KEYS, MINOR_KEYS,
  };
}
