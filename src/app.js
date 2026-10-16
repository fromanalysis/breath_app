/* Breath (web): the page. Engine classes come from engine.js, loaded just before this script. */
(() => {
'use strict';

// ---------------------------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------------------------

let lang = 'en';
const t = (en, ru) => (lang === 'ru' ? ru : en);
function ruPlural(n, one, few, many) {
  const n100 = n % 100, n10 = n % 10;
  if (n100 >= 11 && n100 <= 14) return many;
  if (n10 === 1) return one;
  if (n10 >= 2 && n10 <= 4) return few;
  return many;
}
const minutesText = (n) => (lang === 'ru' ? `${n} ${ruPlural(n, 'минута', 'минуты', 'минут')}` : `${n} ${n === 1 ? 'minute' : 'minutes'}`);
function fmt(v) {
  const tenths = Math.round(v * 10);
  return tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)}${lang === 'ru' ? ',' : '.'}${tenths % 10}`;
}
function formatClock(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------------------------------
// Presets and sessions (same as the Android app)
// ---------------------------------------------------------------------------------------------

const P = (inhale, holdIn, exhale, holdOut) => ({ inhale, holdIn, exhale, holdOut });
const PRESETS = [
  { id: 'resonance55', en: 'Resonance', ru: 'Резонанс', dEn: 'Even 5.5 s in and out, about 5.5 breaths a minute.', dRu: 'Ровно 5,5 с на вдох и на выдох, около 5,5 дыханий в минуту.', p: P(5.5, 0, 5.5, 0) },
  { id: 'resonance6', en: 'Slow resonance', ru: 'Медленный резонанс', dEn: 'Even 6 s in and out, 5 breaths a minute.', dRu: 'Ровно 6 с на вдох и на выдох, 5 дыханий в минуту.', p: P(6, 0, 6, 0) },
  { id: 'calming', en: 'Calming', ru: 'Успокоение', dEn: 'A longer exhale than inhale, to settle down.', dRu: 'Выдох длиннее вдоха, чтобы успокоиться.', p: P(4, 0, 6, 0) },
  { id: 'box', en: 'Box', ru: 'Квадрат', dEn: 'Four equal sides: in, hold, out, hold.', dRu: 'Четыре равные стороны: вдох, задержка, выдох, задержка.', p: P(4, 4, 4, 4) },
  { id: '478', en: '4-7-8', ru: '4-7-8', dEn: 'In for 4, hold for 7, out for 8. Often used before sleep.', dRu: 'Вдох на 4, задержка на 7, выдох на 8. Часто перед сном.', p: P(4, 7, 8, 0) },
];
const presetById = (id) => PRESETS.find((p) => p.id === id);

const Hs = (o) => ({ ...HARMONY_DEFAULTS, ...o, focusSeed: 0 });
const SESSIONS = [
  { id: 'everyday', en: 'Everyday', ru: 'На каждый день', dEn: 'Ten minutes of even breathing, with chords in C major.', dRu: 'Десять минут ровного дыхания, аккорды в C мажоре.',
    minutes: 10, preset: 'resonance55', h: Hs({ program: 'IN_KEY', keyRoot: 0, timing: 'HALF_BREATH', blend: 0.5 }) },
  { id: 'wind_down', en: 'Wind down', ru: 'Расслабиться', dEn: 'Fifteen minutes, longer out than in. Soft seventh chords in E♭, one per breath.', dRu: 'Пятнадцать минут, выдох длиннее вдоха. Мягкие септаккорды в E♭, один на дыхание.',
    minutes: 15, preset: 'calming', h: Hs({ program: 'IN_KEY', keyRoot: 3, sevenths: true, timing: 'BREATH', blend: 0.7, bass: 'SMOOTH' }) },
  { id: 'sleep', en: 'Sleep', ru: 'Сон', dEn: 'Twenty slow minutes. Very gradual chord changes in D♭. The screen can go dark.', dRu: 'Двадцать медленных минут. Очень плавная смена аккордов в D♭. Экран может погаснуть.',
    minutes: 20, preset: 'resonance6', h: Hs({ program: 'IN_KEY', keyRoot: 1, timing: 'BREATH', blend: 1 }), display: 'BREATH_ONLY', keepScreenOn: false },
  { id: 'circle', en: 'Around the circle', ru: 'По кругу', dEn: 'All twelve roots in turn, as dominant seventh chords.', dRu: 'Все двенадцать тоник по очереди, доминантсептаккордами.',
    minutes: 15, preset: 'resonance55', h: Hs({ program: 'CIRCLE', circleQuality: 'DOMINANT7', keyRoot: 0, timing: 'HALF_BREATH', blend: 0.4, bass: 'SMOOTH', focus: 'SEVENTH', focusDepth: 0.5 }) },
  { id: 'key_tour', en: 'Key tour', ru: 'По тональностям', dEn: 'A new key every minute or so, each a fifth above the last.', dRu: 'Новая тональность примерно каждую минуту, каждая на квинту выше предыдущей.',
    minutes: 15, preset: 'resonance55', h: Hs({ program: 'IN_KEY', keyRoot: 0, tourKeys: true, timing: 'HALF_BREATH', blend: 0.4, bass: 'SMOOTH' }) },
  { id: 'inside', en: 'Inside the chord', ru: 'Внутри аккорда', dEn: 'Ten minutes in A minor. Single notes drift forward and back.', dRu: 'Десять минут в A миноре. Отдельные ноты то выходят вперёд, то отступают.',
    minutes: 10, preset: 'resonance55', h: Hs({ program: 'IN_KEY', keyRoot: 9, keyMode: 'MINOR', sevenths: true, timing: 'HALF_BREATH', blend: 0.35, bass: 'SMOOTH', focus: 'WANDER', focusDepth: 0.7 }) },
];
const sessionById = (id) => SESSIONS.find((s) => s.id === id);

/** What a session sets: breathing, music and screen. Volume, vibration and language stay yours. */
function applySession(s, base) {
  const out = structuredClone(base);
  out.sessionId = s.id;
  out.presetId = s.preset;
  out.minutes = s.minutes;
  out.sound.tone = 'PAD';
  out.sound.air = true;
  out.sound.softTurnaround = true;
  out.sound.harmony = structuredClone(s.h);
  out.display = s.display || 'CHORD_AND_NOTES';
  out.keepScreenOn = s.keepScreenOn !== false;
  return out;
}
const sessionKey = (st) => JSON.stringify([st.presetId, st.presetId === 'custom' ? st.custom : null, st.minutes, st.sound.tone, st.sound.air, st.sound.softTurnaround, st.sound.harmony, st.display, st.keepScreenOn]);
const isEdited = (st) => sessionKey(applySession(sessionById(st.sessionId), st)) !== sessionKey(st);

// ---------------------------------------------------------------------------------------------
// Settings (kept in this browser only)
// ---------------------------------------------------------------------------------------------

const STORE_KEY = 'breath.settings.v1';
function defaultSettings() {
  const base = {
    sessionId: 'everyday', presetId: 'resonance55', custom: P(5.5, 0, 5.5, 0), minutes: 10,
    sound: { tone: 'PAD', air: true, softTurnaround: true, volume: 0.8, harmony: Hs({}) },
    vibration: false, keepScreenOn: true, display: 'CHORD_AND_NOTES',
    lang: (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en',
  };
  return applySession(SESSIONS[0], base);
}
function loadSettings() {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    const merged = { ...d, ...s, custom: { ...d.custom, ...(s.custom || {}) }, sound: { ...d.sound, ...(s.sound || {}) } };
    merged.sound.harmony = { ...d.sound.harmony, ...((s.sound || {}).harmony || {}) };
    if (!sessionById(merged.sessionId)) merged.sessionId = 'everyday';
    if (merged.presetId !== 'custom' && !presetById(merged.presetId)) merged.presetId = 'resonance55';
    return merged;
  } catch (e) { return d; }
}
function saveSettings() { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* private mode: fine */ } }

let settings = loadSettings();
lang = settings.lang;
const patternOf = (st) => (st.presetId === 'custom' ? st.custom : presetById(st.presetId).p);
const patternName = (st) => (st.presetId === 'custom' ? t('Custom', 'Своё') : t(presetById(st.presetId).en, presetById(st.presetId).ru));

// ---------------------------------------------------------------------------------------------
// Music words
// ---------------------------------------------------------------------------------------------

const QUALITY_LONG = {
  MAJOR: ['major', 'мажорное трезвучие'], MINOR: ['minor', 'минорное трезвучие'],
  DIMINISHED: ['diminished', 'уменьшённое трезвучие'], AUGMENTED: ['augmented', 'увеличенное трезвучие'],
  DOMINANT7: ['dominant seventh', 'доминантсептаккорд'], MAJOR7: ['major seventh', 'большой мажорный септаккорд'],
  MINOR7: ['minor seventh', 'малый минорный септаккорд'], HALF_DIMINISHED7: ['half-diminished', 'полууменьшённый септаккорд'],
  DIMINISHED7: ['diminished seventh', 'уменьшённый септаккорд'], MINOR_MAJOR7: ['minor-major seventh', 'минор-мажорный септаккорд'],
  AUGMENTED_MAJOR7: ['augmented-major seventh', 'большой увеличенный септаккорд'],
};
const chordLongName = (chord) => {
  const q = t(...QUALITY_LONG[chord.quality.id]);
  return lang === 'ru' ? `${chord.root} — ${q}` : `${chord.root} ${q}`;
};
const inversionName = (i) => [t('root position', 'основной вид'), t('1st inversion', '1-е обращение'), t('2nd inversion', '2-е обращение'), t('3rd inversion', '3-е обращение')][i];
const modeWord = (m) => (m === 'MAJOR' ? t('major', 'мажор') : t('minor', 'минор'));
const roleWords = () => [t('root', 'прима'), t('3rd', 'терция'), t('5th', 'квинта'), t('7th', 'септима')];
const CIRCLE_TITLES = { MAJOR: ['Major', 'мажор'], MINOR: ['Minor', 'минор'], MAJOR_MINOR: ['Major → minor', 'мажор → минор'], DOMINANT7: '7', MAJOR7: 'maj7', MINOR7: 'm7', HALF_DIMINISHED7: 'm7♭5', DIMINISHED7: '°7', MINOR_MAJOR7: 'm(maj7)', AUGMENTED_MAJOR7: '+maj7' };
const circleTitle = (q) => (Array.isArray(CIRCLE_TITLES[q]) ? t(...CIRCLE_TITLES[q]) : CIRCLE_TITLES[q]);
const keyName = (h) => (h.keyMode === 'MAJOR' ? MAJOR_KEYS : MINOR_KEYS)[h.keyRoot].toString();
const DIAL_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

function breathingSummary(p) {
  const parts = [t(`${fmt(p.inhale)} s in`, `вдох ${fmt(p.inhale)} с`)];
  if (p.holdIn > 0) parts.push(t(`hold ${fmt(p.holdIn)}`, `задержка ${fmt(p.holdIn)}`));
  parts.push(t(`${fmt(p.exhale)} s out`, `выдох ${fmt(p.exhale)} с`));
  if (p.holdOut > 0) parts.push(t(`hold ${fmt(p.holdOut)}`, `задержка ${fmt(p.holdOut)}`));
  return parts.join(', ');
}
function musicSummary(st) {
  const h = st.sound.harmony;
  if (st.sound.tone === 'BOWLS') return t('Singing bowls', 'Поющие чаши');
  if (st.sound.tone === 'OFF') return t('No music', 'Без музыки');
  if (h.program === 'DRONE') return t('One chord', 'Один аккорд');
  if (h.program === 'CIRCLE') return t(`Around the circle, ${circleTitle(h.circleQuality)}`, `По кругу, ${circleTitle(h.circleQuality)}`);
  return lang === 'ru' ? `${h.sevenths ? 'Септаккорды' : 'Аккорды'}, ${keyName(h)} ${modeWord(h.keyMode)}` : `${h.sevenths ? 'Sevenths' : 'Chords'} in ${keyName(h)} ${modeWord(h.keyMode)}`;
}
function describe(st) {
  const minutes = st.minutes === 0 ? t('no time limit', 'без ограничения времени') : minutesText(st.minutes);
  const h = st.sound.harmony;
  let music;
  if (st.sound.tone === 'BOWLS') music = t('singing bowls', 'поющие чаши');
  else if (st.sound.tone === 'OFF') music = t('no music', 'без музыки');
  else if (h.program === 'DRONE') music = t('one open chord', 'один открытый аккорд');
  else if (h.program === 'CIRCLE') music = t(`around the circle in ${circleTitle(h.circleQuality)} chords`, `по кругу, аккорды: ${circleTitle(h.circleQuality)}`);
  else music = lang === 'ru' ? `${h.sevenths ? 'септаккорды' : 'аккорды'}, ${keyName(h)} ${modeWord(h.keyMode)}` : `${h.sevenths ? 'seventh chords' : 'chords'} in ${keyName(h)} ${modeWord(h.keyMode)}`;
  return t(`${patternName(st)} breathing, ${minutes}, ${music}.`, `Дыхание «${patternName(st)}», ${minutes}, ${music}.`);
}
const phaseLabel = (ph) => [t('Get ready', 'Приготовьтесь'), t('Breathe in', 'Вдох'), t('Hold', 'Задержка'), t('Breathe out', 'Выдох'), t('Hold', 'Задержка'), t('Done', 'Готово')][ph];

// ---------------------------------------------------------------------------------------------
// The tuning dial (canvas port of Dial.kt)
// ---------------------------------------------------------------------------------------------

const C = {
  ink: '#0E1222', raised: '#232A45', engraving: '#2A3150', engravingStrong: '#3A4366',
  moon: '#DCDFEA', pewter: '#8C93AB', faint: '#5B6380', breath: '#D6DCE6',
  roles: ['#F2D7A0', '#F59AAE', '#86D0E8', '#A68BF0'],
};
const FONT = '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif';
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1).toFixed(3)})`;
}
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const POSITION = new Array(12);
FIFTHS.forEach((pc, i) => { POSITION[pc] = i; });
const angleOf = (pc) => POSITION[pc] * Math.PI / 6;
const smooth01 = (x) => { const v = clamp(x, 0, 1); return v * v * (3 - 2 * v); };

const EMPTY_DIAL = { weight: new Float32Array(12), role: new Int8Array(12), gain: new Float32Array(12).fill(1), bassPc: -1, names: DIAL_NAMES };

/** The dial while moving from prev to cur: common tones stay, others fade out and in over mix. */
function dialBetween(cur, prev, mix, focus) {
  const weight = new Float32Array(12);
  const role = new Int8Array(12);
  const names = DIAL_NAMES.slice();
  if (prev && mix < 1) {
    prev.info.chord.tones.forEach((n, i) => { weight[n.pc] += 1 - mix; role[n.pc] = i; names[n.pc] = n.toString(); });
  }
  const m = prev ? mix : 1;
  cur.info.chord.tones.forEach((n, i) => { weight[n.pc] = Math.min(1, weight[n.pc] + m); role[n.pc] = i; names[n.pc] = n.toString(); });
  const gain = new Float32Array(12);
  for (let pc = 0; pc < 12; pc++) gain[pc] = focus ? focus[role[pc]] : 1;
  return { weight, role, gain, bassPc: mod12(cur.midi[0]), names };
}

function drawDial(canvas, lung, chord, labels) {
  const rect = canvas.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  if (size < 4) return;
  const dpr = window.devicePixelRatio || 1;
  const px = Math.round(size * dpr);
  if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  const dim = size, c = size / 2;
  const labelBand = labels === 'NONE' ? 0 : 44;
  const rTicks = dim / 2 - labelBand - dim * 0.02;
  const at = (a, r) => [c + r * Math.sin(a), c - r * Math.cos(a)];

  // Engraving: 60 fine ticks, every fifth one longer (the twelve note positions).
  const minorLen = Math.max(2, dim * 0.012), majorLen = Math.max(4, dim * 0.03);
  g.lineCap = 'butt';
  for (let i = 0; i < 60; i++) {
    const a = i * Math.PI / 30;
    const major = i % 5 === 0;
    const [x1, y1] = at(a, rTicks), [x2, y2] = at(a, rTicks + (major ? majorLen : minorLen));
    g.strokeStyle = major ? C.engravingStrong : C.raised;
    g.lineWidth = major ? 1.5 : 1;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }

  // The body: r(θ) = B·(1 + D·Σ wᵢ·exp(9(cos(θ−θᵢ)−1))). Lobes grow with the breath.
  const rFig = rTicks * 0.97;
  const l = clamp(lung, 0, 1);
  const b = rFig * (0.30 + 0.38 * l);
  const d = 0.06 + 0.30 * l;
  const w = chord.weight;
  const radius = (th) => {
    let s = 0;
    for (let pc = 0; pc < 12; pc++) if (w[pc] > 0.001) s += w[pc] * Math.exp(9 * (Math.cos(th - angleOf(pc)) - 1));
    return b * (1 + d * s);
  };
  g.beginPath();
  for (let k = 0; k < 120; k++) {
    const th = 2 * Math.PI * k / 120;
    const [x, y] = at(th, radius(th));
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = rgba(C.breath, 0.13);
  g.fill();
  g.strokeStyle = rgba(C.moon, 0.5);
  g.lineWidth = 1.5;
  g.stroke();

  // The bass: a short inward mark at its note. Off the root means an inversion.
  const bass = chord.bassPc;
  if (bass >= 0 && w[bass] > 0.02) {
    const [x1, y1] = at(angleOf(bass), rTicks - 2), [x2, y2] = at(angleOf(bass), rTicks - 12);
    g.strokeStyle = rgba(C.roles[chord.role[bass]], w[bass]);
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }

  // Tips: a dot per sounding note in its role colour; size and brightness follow its focus.
  const presence = (pc) => {
    const db = 20 * Math.log10(Math.max(chord.gain[pc], 1e-4));
    return { db, alpha: w[pc] * (0.4 + 0.6 * smooth01((db + 24) / 30)) };
  };
  for (let pc = 0; pc < 12; pc++) {
    if (w[pc] < 0.02) continue;
    const { db, alpha } = presence(pc);
    const scale = clamp(1 + db / 24 * 0.5, 0.5, 1.25);
    const [x, y] = at(angleOf(pc), radius(angleOf(pc)));
    const role = chord.role[pc];
    const base = (dim < 120 ? 0.55 : 1) * (role === 0 ? 6.5 : 5);
    g.beginPath();
    g.arc(x, y, base * scale, 0, Math.PI * 2);
    if (role === 3) { g.strokeStyle = rgba(C.roles[3], alpha); g.lineWidth = 1.5; g.stroke(); }
    else { g.fillStyle = rgba(C.roles[role], alpha); g.fill(); }
  }

  // Letters around the dial.
  if (labels !== 'NONE') {
    const rLabel = rTicks + majorLen + labelBand * 0.5;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const words = roleWords();
    for (let pc = 0; pc < 12; pc++) {
      const sounding = w[pc] > 0.02;
      if (labels === 'SOUNDING' && !sounding) continue;
      const [x, y] = at(angleOf(pc), rLabel);
      if (sounding) {
        const { alpha } = presence(pc);
        const role = chord.role[pc];
        g.fillStyle = rgba(C.roles[role], alpha);
        if (labels === 'SOUNDING') {
          g.font = `600 21px ${FONT}`;
          g.fillText(chord.names[pc], x, y - 7);
          g.font = `400 11px ${FONT}`;
          g.fillStyle = rgba(C.pewter, alpha);
          g.fillText(words[role], x, y + 11);
        } else {
          g.font = `600 20px ${FONT}`;
          g.fillText(chord.names[pc], x, y);
        }
      } else {
        g.font = `400 15px ${FONT}`;
        g.fillStyle = C.faint;
        g.fillText(DIAL_NAMES[pc], x, y);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Audio: an AudioWorklet runs the engine; the page reads the audio clock
// ---------------------------------------------------------------------------------------------

let audio = null; // { ctx, kind, post, onDone }
let lastClock = 0;

async function ensureAudio() {
  if (audio) { await audio.ctx.resume(); return audio; }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC({ latencyHint: 'playback' });
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  audio = { ctx, kind: null, post: null, onDone: null };
  const resumed = ctx.resume();
  try {
    if (!ctx.audioWorklet) throw new Error('no AudioWorklet');
    const src = document.getElementById('engine-src').textContent;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(ctx, 'breath', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = (e) => { if (e.data.type === 'done' && audio.onDone) audio.onDone(); };
    node.connect(ctx.destination);
    audio.post = (m) => node.port.postMessage(m);
    audio.kind = 'worklet';
  } catch (err) {
    console.warn('AudioWorklet unavailable, using ScriptProcessor', err);
    setupScriptProcessor(ctx);
  }
  await resumed;
  return audio;
}

/** Fallback for browsers without AudioWorklet: same engine, on the page thread. */
function setupScriptProcessor(ctx) {
  const sp = ctx.createScriptProcessor(4096, 1, 2);
  let engine = null, startFrame = 0, counter = 0;
  sp.onaudioprocess = (e) => {
    const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
    const f = typeof e.playbackTime === 'number' ? Math.round(e.playbackTime * ctx.sampleRate) : counter;
    counter = f + L.length;
    if (!engine) { L.fill(0); R.fill(0); return; }
    const done = engine.render(L, R, f - startFrame, L.length);
    if (done && !engine.doneSent) { engine.doneSent = true; if (audio.onDone) audio.onDone(); }
  };
  sp.connect(ctx.destination);
  audio.post = (m) => {
    if (m.type === 'start') { engine = new SessionEngine(ctx.sampleRate, m.config); startFrame = m.startFrame; }
    else if (m.type === 'stop') engine = null;
    else if (engine) engine.message(m);
  };
  audio.kind = 'script';
}

/** Context time of what is reaching the speaker now. Frozen while the context is suspended. */
function contextNow() {
  const ctx = audio.ctx;
  if (ctx.state !== 'running') return lastClock;
  let tNow = null;
  if (ctx.getOutputTimestamp) {
    const ts = ctx.getOutputTimestamp();
    if (ts && ts.performanceTime > 0) tNow = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
  }
  if (tNow == null) tNow = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  tNow = Math.min(tNow, ctx.currentTime);
  if (tNow < lastClock) tNow = lastClock;
  lastClock = tNow;
  return tNow;
}

// ---------------------------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------------------------

let run = null;
let runSerial = 0;
let wakeLock = null;

async function requestWakeLock() {
  if (!run || !run.config.keepScreenOn || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}
function releaseWakeLock() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }

async function startSession() {
  const st = settings;
  const sess = sessionById(st.sessionId);
  const sound = structuredClone(st.sound);
  sound.harmony.focusSeed = Math.floor(Math.random() * 2 ** 31);
  const config = {
    pattern: { ...patternOf(st) }, minutes: st.minutes, sound,
    keepScreenOn: st.keepScreenOn, display: st.display, vibration: st.vibration,
    title: isEdited(st) ? patternName(st) : t(sess.en, sess.ru),
  };
  const id = ++runSerial;
  const a = await ensureAudio();
  const ctx = a.ctx;
  const startTime = ctx.currentTime + 0.12;
  run = {
    id, config, startTime, paused: false, finished: false,
    timeline: new BreathTimeline(config.pattern, config.minutes > 0 ? config.minutes * 60 : null),
    track: new HarmonyTrack(sound.harmony),
    focus: new Float64Array(4), lastPhaseKey: '', hidden: null, controlsUntil: 0,
  };
  lastClock = Math.max(lastClock, ctx.currentTime - 0.5);
  a.onDone = () => { if (!run || run.id === id) { a.post({ type: 'stop' }); ctx.suspend(); } };
  a.post({ type: 'start', config, startFrame: Math.round(startTime * ctx.sampleRate) });
  a.post({ type: 'volume', value: st.sound.volume });
  showScreen('session');
  requestWakeLock();
  setupMediaSession();
  renderSessionStatic();
}

function sessionTime() { return run ? Math.max(0, contextNow() - run.startTime) : 0; }

function pause() {
  if (!run || run.paused || run.finished) return;
  run.paused = true;
  const id = run.id;
  audio.post({ type: 'gain', value: 0 });
  setTimeout(() => { if (run && run.id === id && run.paused) audio.ctx.suspend(); }, 400);
  renderSessionStatic();
}
async function resume() {
  if (!run || !run.paused) return;
  await audio.ctx.resume();
  audio.post({ type: 'gain', value: 1 });
  run.paused = false;
  run.controlsUntil = performance.now() + 2500;
  requestWakeLock();
  renderSessionStatic();
}
function endSession() {
  if (!run) return;
  audio.post({ type: 'gain', value: 0 });
  run = null;
  releaseWakeLock();
  showScreen('home');
  // Let the fade finish, then go quiet (unless a new session has started meanwhile).
  setTimeout(() => { if (!run) { audio.post({ type: 'stop' }); audio.ctx.suspend(); } }, 400);
}
function finishSession() {
  run.finished = true;
  releaseWakeLock();
  const tl = run.timeline;
  const breaths = Math.round(tl.breathingSeconds / tl.cycleSeconds);
  $('#doneSummary').textContent = lang === 'ru'
    ? `${breaths} ${ruPlural(breaths, 'дыхание', 'дыхания', 'дыханий')} за ${formatClock(tl.breathingSeconds)}`
    : `${breaths} breaths in ${formatClock(tl.breathingSeconds)}`;
  $('#doneTitle').textContent = run.config.title;
  showScreen('done');
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: run.config.title, artist: 'Breath' });
    navigator.mediaSession.setActionHandler('play', () => resume());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('stop', () => endSession());
  } catch (e) { /* optional */ }
}

// Screen-off check: when the page comes back, compare wall time with how far the audio clock moved.
document.addEventListener('visibilitychange', async () => {
  if (!run || run.finished) return;
  if (document.visibilityState === 'hidden') {
    if (!run.paused) run.hidden = { wall: Date.now(), t: sessionTime() };
    return;
  }
  const h = run.hidden;
  run.hidden = null;
  const browserStopped = !run.paused && audio.ctx.state !== 'running';
  if (h) {
    const away = (Date.now() - h.wall) / 1000;
    const moved = sessionTime() - h.t;
    if (away >= 5) {
      const ok = moved >= away - 1.5;
      showToast(ok
        ? t(`Screen off for ${formatClock(away)}. Breathing and sound kept going the whole time.`, `Экран был выключен ${formatClock(away)}. Дыхание и звук всё это время шли.`)
        : t(`Screen off for ${formatClock(away)}, but the browser stopped the sound after ${formatClock(Math.max(0, moved))}.`, `Экран был выключен ${formatClock(away)}, но браузер остановил звук через ${formatClock(Math.max(0, moved))}.`),
        ok ? 'ok' : 'warn');
    }
  }
  if (browserStopped) {
    // Keep the session where the sound stopped; one tap on Resume carries on from there.
    run.paused = true;
    audio.post({ type: 'gain', value: 0 });
    renderSessionStatic();
  }
  requestWakeLock();
});

// ---------------------------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------------------------

const $ = (s) => document.querySelector(s);
const screens = { home: $('#home'), session: $('#session'), done: $('#done') };
let current = 'home';
function showScreen(name) {
  current = name;
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  if (name === 'home') renderHome();
}

let toastTimer = 0;
function showToast(text, kind) {
  const el = $('#toast');
  el.textContent = text;
  el.dataset.kind = kind || '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 9000);
}

const ICONS = {
  breath: '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M2 11c2.5-6 6.5-6 9 0s6.5 6 9 0"/></svg>',
  clock: '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8.2"/><path d="M11 6.5V11l3 2"/></svg>',
  note: '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M8 16.5V4.5l10-2v12"/><circle cx="5.8" cy="16.5" r="2.4"/><circle cx="15.8" cy="14.5" r="2.4"/></svg>',
};

function renderStaticText() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-en]')) el.textContent = lang === 'ru' ? el.dataset.ru : el.dataset.en;
  for (const el of document.querySelectorAll('[data-aria-en]')) el.setAttribute('aria-label', lang === 'ru' ? el.dataset.ariaRu : el.dataset.ariaEn);
}

function renderHome() {
  renderStaticText();
  const st = settings;
  const sess = sessionById(st.sessionId);
  $('#sessionName').textContent = t(sess.en, sess.ru);
  $('#sessionDesc').textContent = isEdited(st) ? t('Changed: ', 'Изменено: ') + describe(st) : t(sess.dEn, sess.dRu);
  const rows = [
    ['breathing', ICONS.breath, t('Breathing', 'Дыхание'), breathingSummary(patternOf(st))],
    ['length', ICONS.clock, t('Length', 'Длительность'), st.minutes === 0 ? t('No limit', 'Без ограничения') : minutesText(st.minutes)],
    ['music', ICONS.note, t('Music', 'Музыка'), musicSummary(st)],
  ];
  $('#rows').innerHTML = rows.map(([id, icon, label, value]) =>
    `<button class="row" type="button" data-sheet="${id}">${icon}<span class="row-label">${esc(label)}</span><span class="row-value">${esc(value)}</span></button>`).join('');
  preview.dirty = true;
}

// ---------------------------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------------------------

let openSheet = null;
const chips = (path, options, value) => `<div class="chips">${options.map(([v, label]) =>
  `<button type="button" class="chip" data-set="${path}" data-val='${esc(JSON.stringify(v))}' aria-pressed="${JSON.stringify(v) === JSON.stringify(value)}">${esc(label)}</button>`).join('')}</div>`;
const field = (label, body, hint) => `<div class="field"><div class="field-label">${esc(label)}</div>${body}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
const toggle = (path, label, value, hint) => `<label class="toggle"><span><span class="toggle-label">${esc(label)}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</span><input type="checkbox" role="switch" id="tg-${path.replace(/\./g, '-')}" data-set="${path}" ${value ? 'checked' : ''}></label>`;
const slider = (path, value, left, right, extra) => `<div class="slider"><input type="range" min="0" max="1" step="0.01" id="sl-${path.replace(/\./g, '-')}" data-set="${path}" value="${value}"><div class="slider-ends"><span>${esc(left)}</span>${extra ? `<span class="slider-mid">${esc(extra)}</span>` : ''}<span>${esc(right)}</span></div></div>`;

const SHEETS = {
  sessions: {
    title: () => t('Sessions', 'Сессии'),
    body: () => SESSIONS.map((s) => {
      const selected = s.id === settings.sessionId;
      return `<button type="button" class="session-item" data-session="${s.id}" aria-current="${selected}">
        <canvas class="mini-dial" data-mini="${s.id}" aria-hidden="true"></canvas>
        <span class="session-text"><span class="session-title">${esc(t(s.en, s.ru))}</span><span class="session-d">${esc(t(s.dEn, s.dRu))}</span>
        ${selected && isEdited(settings) ? `<span class="session-edited">${esc(t('You\'ve changed this one. Tap to go back to how it was.', 'Вы изменили эту сессию. Нажмите, чтобы вернуть как было.'))}</span>` : ''}</span>
        ${selected ? '<span class="check" aria-hidden="true">✓</span>' : ''}</button>`;
    }).join('') + `<p class="hint pad">${esc(t('A session sets the breathing, the music and the screen. Volume and vibration stay as you set them.', 'Сессия задаёт дыхание, музыку и экран. Громкость и вибрация остаются такими, как вы их настроили.'))}</p>`,
  },
  breathing: {
    title: () => t('Breathing', 'Дыхание'),
    body: () => {
      const st = settings;
      const items = PRESETS.map((p) => `<button type="button" class="pick" data-preset="${p.id}" aria-pressed="${st.presetId === p.id}">
        <span class="pick-title">${esc(t(p.en, p.ru))} <span class="pick-pattern">${esc(shortLabel(p.p))}</span></span><span class="pick-d">${esc(t(p.dEn, p.dRu))}</span></button>`).join('');
      const c = st.custom;
      const custom = `<button type="button" class="pick" data-preset="custom" aria-pressed="${st.presetId === 'custom'}"><span class="pick-title">${esc(t('Custom', 'Своё'))} <span class="pick-pattern">${esc(shortLabel(c))}</span></span><span class="pick-d">${esc(t('Your own timings, in seconds.', 'Свои длительности, в секундах.'))}</span></button>`;
      const step = (k, label, min, max) => `<div class="stepper"><span>${esc(label)}</span><span class="stepper-ctl">
        <button type="button" data-step="${k}" data-d="-0.5" aria-label="−0.5">−</button><output>${fmt(c[k])}</output><button type="button" data-step="${k}" data-d="0.5" aria-label="+0.5">+</button></span></div>`;
      const steppers = st.presetId === 'custom' ? `<div class="steppers">${step('inhale', t('In', 'Вдох'))}${step('holdIn', t('Hold full', 'Задержка на вдохе'))}${step('exhale', t('Out', 'Выдох'))}${step('holdOut', t('Hold empty', 'Задержка на выдохе'))}</div>` : '';
      return `<div class="picks">${items}${custom}</div>${steppers}`;
    },
  },
  length: {
    title: () => t('Length', 'Длительность'),
    body: () => field(t('Minutes', 'Минуты'), chips('minutes', [3, 5, 10, 15, 20, 30].map((m) => [m, String(m)]).concat([[0, t('No limit', 'Без ограничения')]]), settings.minutes),
      t('A timed session always finishes the breath it is in.', 'Сессия по времени всегда заканчивает начатое дыхание.')),
  },
  music: {
    title: () => t('Music', 'Музыка'),
    body: () => {
      const s = settings.sound, h = s.harmony;
      let out = field(t('Sound', 'Звук'), chips('sound.tone', [['PAD', t('Pad', 'Пэд')], ['BOWLS', t('Singing bowls', 'Поющие чаши')], ['OFF', t('Off', 'Выкл.')]], s.tone));
      if (s.tone === 'PAD') {
        out += field(t('What it plays', 'Что звучит'), chips('sound.harmony.program', [['IN_KEY', t('Circle in a key', 'Круг в тональности')], ['CIRCLE', t('Circle of fourths', 'Квартовый круг')], ['DRONE', t('One chord', 'Один аккорд')]], h.program));
        if (h.program === 'IN_KEY') {
          const keys = (h.keyMode === 'MAJOR' ? MAJOR_KEYS : MINOR_KEYS);
          out += field(t('Key', 'Тональность'), `<div class="row-ctl"><select id="sel-key" data-set="sound.harmony.keyRoot">${keys.map((k, i) => `<option value="${i}" ${i === h.keyRoot ? 'selected' : ''}>${esc(k.toString())}</option>`).join('')}</select>${chips('sound.harmony.keyMode', [['MAJOR', t('Major', 'Мажор')], ['MINOR', t('Minor', 'Минор')]], h.keyMode)}</div>`);
          out += field(t('Chords', 'Аккорды'), chips('sound.harmony.sevenths', [[false, t('Triads', 'Трезвучия')], [true, t('Sevenths', 'Септаккорды')]], h.sevenths));
          out += toggle('sound.harmony.tourKeys', t('Move through keys', 'Переходить по тональностям'), h.tourKeys, t('After two rounds, the V chord becomes the new I, a fifth up.', 'После двух кругов V становится новой I, на квинту выше.'));
        } else if (h.program === 'CIRCLE') {
          out += field(t('Chord colour', 'Окраска аккордов'), chips('sound.harmony.circleQuality', Object.keys(CIRCLE_TITLES).map((q) => [q, circleTitle(q)]), h.circleQuality));
          out += field(t('Start on', 'Начать с'), `<select id="sel-start" data-set="sound.harmony.keyRoot">${DIAL_NAMES.map((n, i) => `<option value="${i}" ${i === h.keyRoot ? 'selected' : ''}>${n}</option>`).join('')}</select>`);
        }
        if (h.program !== 'DRONE') {
          const p = patternOf(settings);
          out += field(t('Chord changes', 'Смена аккордов'), chips('sound.harmony.timing', [['HALF_BREATH', t('Every half-breath', 'На вдохе и на выдохе')], ['BREATH', t('Every breath', 'Раз за дыхание')]], h.timing));
          out += field(t('Blend', 'Переход'), slider('sound.harmony.blend', h.blend, t('Quick', 'Быстрый'), t('Gradual', 'Плавный'), `${fmt(blendSeconds(h, p.inhale, p.exhale))} ${t('s', 'с')}`));
          out += field(t('Bass', 'Бас'), chips('sound.harmony.bass', [['ROOTS', t('Roots', 'Основные тоны')], ['SMOOTH', t('Smooth, with inversions', 'Плавно, с обращениями')]], h.bass));
          out += field(t('Note focus', 'Фокус на нотах'), chips('sound.harmony.focus', [['OFF', t('Off', 'Выкл.')], ['WANDER', t('Wander', 'Блуждание')], ['THIRD', t('Spotlight third', 'Терция')], ['SEVENTH', t('Spotlight seventh', 'Септима')], ['ROOT', t('Spotlight root', 'Прима')]], h.focus),
            t('Single chord tones slowly come forward or step back.', 'Отдельные звуки аккорда медленно выходят вперёд или отступают.'));
          if (h.focus !== 'OFF') out += field(t('Focus depth', 'Глубина фокуса'), slider('sound.harmony.focusDepth', h.focusDepth, t('Subtle', 'Слегка'), t('Strong', 'Сильно')));
        }
      }
      out += toggle('sound.air', t('Air', 'Воздух'), s.air, t('Soft noise that swells with each breath.', 'Мягкий шум, который нарастает с каждым вдохом и выдохом.'));
      if (s.tone === 'PAD') out += toggle('sound.softTurnaround', t('Soft turnaround', 'Мягкий разворот'), s.softTurnaround, t('A small dip where in turns to out.', 'Небольшой спад там, где вдох переходит в выдох.'));
      out += field(t('Volume', 'Громкость'), slider('sound.volume', s.volume, t('Quiet', 'Тихо'), t('Loud', 'Громко')));
      return out;
    },
  },
  settings: {
    title: () => t('Settings', 'Настройки'),
    body: () => {
      const st = settings;
      let out = field(t('During a session, show', 'Во время сессии показывать'), chips('display', [['CHORD_AND_NOTES', t('Chord and notes', 'Аккорд и ноты')], ['CHORD_NAME', t('Chord name', 'Название аккорда')], ['BREATH_ONLY', t('Breath only', 'Только дыхание')]], st.display));
      out += toggle('keepScreenOn', t('Keep the screen on', 'Не выключать экран'), st.keepScreenOn, t('Turn this off to test breathing with the screen off.', 'Выключите, чтобы проверить дыхание с выключенным экраном.'));
      out += toggle('vibration', t('Vibration cues', 'Вибрация'), st.vibration, t('Phones that support it, only while the screen is on.', 'Если телефон поддерживает, и только при включённом экране.'));
      out += field(t('Language', 'Язык'), chips('lang', [['en', 'English'], ['ru', 'Русский']], st.lang));
      const engine = !audio ? t('starts with your first session', 'запустится с первой сессией')
        : audio.kind === 'worklet' ? t('AudioWorklet, on the browser\'s audio thread', 'AudioWorklet, в аудиопотоке браузера')
          : t('ScriptProcessor fallback, on the page thread (less reliable with the screen off)', 'запасной ScriptProcessor, в потоке страницы (менее надёжен при выключенном экране)');
      out += `<div class="about"><h3>${esc(t('Screen-off test', 'Проверка с выключенным экраном'))}</h3>
        <ol>
          <li>${esc(t('Turn off "Keep the screen on" above.', 'Выключите «Не выключать экран» выше.'))}</li>
          <li>${esc(t('Start a session, then lock the phone for a few minutes.', 'Начните сессию и заблокируйте телефон на несколько минут.'))}</li>
          <li>${esc(t('Unlock. A note says whether the sound kept going the whole time.', 'Разблокируйте. Появится сообщение, шёл ли звук всё это время.'))}</li>
        </ol>
        <p class="hint">${esc(t('Sound engine: ', 'Звуковой движок: ') + engine)}</p>
        <p class="hint">${esc(t('Web prototype of Breath. The sound is synthesized live in your browser by the same engine as the Android app, and the audio clock drives the dial.', 'Веб-прототип Breath. Звук синтезируется прямо в браузере тем же движком, что и в Android-приложении, а циферблат идёт по аудиочасам.'))}</p></div>`;
      return out;
    },
  },
};

function shortLabel(p) {
  const parts = [p.inhale];
  if (p.holdIn > 0) parts.push(p.holdIn);
  parts.push(p.exhale);
  if (p.holdOut > 0) parts.push(p.holdOut);
  return parts.map(fmt).join(' – ');
}

function showSheet(name) {
  openSheet = name;
  const back = $('#sheetBack');
  back.hidden = false;
  renderSheet();
  $('#sheetBody').scrollTop = 0;
  requestAnimationFrame(() => back.classList.add('open'));
  setTimeout(() => $('#sheetClose').focus(), 50);
}
function closeSheet() {
  const back = $('#sheetBack');
  back.classList.remove('open');
  openSheet = null;
  setTimeout(() => { if (!openSheet) back.hidden = true; }, 220);
  renderHome();
}
function renderSheet() {
  if (!openSheet) return;
  const s = SHEETS[openSheet];
  $('#sheetTitle').textContent = s.title();
  $('#sheetClose').textContent = t('Done', 'Готово');
  const body = $('#sheetBody');
  const scroll = body.scrollTop;
  body.innerHTML = s.body();
  body.scrollTop = scroll;
  if (openSheet === 'sessions') {
    for (const cv of body.querySelectorAll('[data-mini]')) {
      const sess = sessionById(cv.dataset.mini);
      drawDial(cv, 0.85, dialBetween(new HarmonyTrack(sess.h).at(0), null, 1, null), 'NONE');
    }
  }
}

function setPath(path, value) {
  const keys = path.split('.');
  let o = settings;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}
function changed() {
  lang = settings.lang;
  saveSettings();
  renderSheet();
  renderHome();
}

$('#sheetBody').addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  if (el.dataset.session) { settings = applySession(sessionById(el.dataset.session), settings); changed(); closeSheet(); return; }
  if (el.dataset.preset) { settings.presetId = el.dataset.preset; changed(); return; }
  if (el.dataset.step) {
    const k = el.dataset.step;
    const hold = k === 'holdIn' || k === 'holdOut';
    const v = Math.round((settings.custom[k] + Number(el.dataset.d)) * 10) / 10;
    settings.custom[k] = clamp(v, hold ? 0 : 1, hold ? 90 : 30);
    changed();
    return;
  }
  if (el.dataset.set && el.dataset.val != null) {
    setPath(el.dataset.set, JSON.parse(el.dataset.val));
    changed();
  }
});
$('#sheetBody').addEventListener('input', (e) => {
  const el = e.target;
  if (el.type === 'range') {
    setPath(el.dataset.set, Number(el.value));
    saveSettings();
    // Update the seconds readout without rebuilding the slider under the finger.
    if (el.dataset.set === 'sound.harmony.blend') {
      const p = patternOf(settings);
      const mid = el.parentElement.querySelector('.slider-mid');
      if (mid) mid.textContent = `${fmt(blendSeconds(settings.sound.harmony, p.inhale, p.exhale))} ${t('s', 'с')}`;
    }
    if (el.dataset.set === 'sound.harmony.focusDepth' || el.dataset.set === 'sound.harmony.blend') preview.dirty = true;
  }
});
$('#sheetBody').addEventListener('change', (e) => {
  const el = e.target;
  if (el.type === 'checkbox') { setPath(el.dataset.set, el.checked); changed(); }
  else if (el.tagName === 'SELECT') { setPath(el.dataset.set, Number(el.value)); changed(); }
  else if (el.type === 'range') changed();
});
$('#sheetClose').addEventListener('click', closeSheet);
$('#sheetBack').addEventListener('click', (e) => { if (e.target.id === 'sheetBack') closeSheet(); });

// Home buttons
$('#rows').addEventListener('click', (e) => { const b = e.target.closest('[data-sheet]'); if (b) showSheet(b.dataset.sheet); });
$('#sessionBtn').addEventListener('click', () => showSheet('sessions'));
$('#settingsBtn').addEventListener('click', () => showSheet('settings'));
$('#testLink').addEventListener('click', () => showSheet('settings'));

// The session dial is the largest square that fits its grid cell.
const sessionDial = $('#sessionDial');
new ResizeObserver(() => {
  const r = sessionDial.parentElement.getBoundingClientRect();
  const side = Math.max(0, Math.min(r.width, r.height, 560));
  sessionDial.style.width = `${side}px`;
  sessionDial.style.height = `${side}px`;
}).observe(sessionDial.parentElement);
$('#startBtn').addEventListener('click', () => { startSession().catch((err) => showToast(t('Could not start the sound: ', 'Не удалось запустить звук: ') + err.message, 'warn')); });

// Session controls
$('#pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); if (run && run.paused) resume(); else pause(); });
$('#endBtn').addEventListener('click', (e) => { e.stopPropagation(); endSession(); });
$('#session').addEventListener('click', () => {
  if (!run) return;
  run.controlsUntil = performance.now() < run.controlsUntil ? 0 : performance.now() + 4000;
  renderSessionStatic();
});
$('#againBtn').addEventListener('click', () => { startSession(); });
$('#doneBtn').addEventListener('click', () => { run = null; showScreen('home'); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openSheet) closeSheet();
    else if (current === 'session' && run) { if (run.paused) endSession(); else pause(); }
  } else if (e.key === ' ' && current === 'session' && run && !e.target.closest('button')) {
    e.preventDefault();
    if (run.paused) resume(); else pause();
  }
});

// ---------------------------------------------------------------------------------------------
// Session rendering
// ---------------------------------------------------------------------------------------------

function renderSessionStatic() {
  if (!run) return;
  renderStaticText();
  $('#sTitle').textContent = run.config.title;
  const show = run.paused || performance.now() < run.controlsUntil;
  $('#controls').classList.toggle('visible', show);
  $('#pauseBtn').textContent = run.paused ? t('Resume', 'Продолжить') : t('Pause', 'Пауза');
  $('#endBtn').textContent = t('End session', 'Завершить');
  $('#session').dataset.display = run.config.display;
}

function leadSheet(v) {
  const root = v.info.chord.root.toString();
  let html = esc(root[0]);
  if (root.length > 1) html += `<span class="acc">${esc(root.slice(1))}</span>`;
  let q = v.info.chord.quality.symbol;
  // The font's degree sign is a thin, high mark; diminished gets a drawn ring that matches the superscripts.
  if (q.startsWith('°')) {
    html += '<span class="dim" role="img" aria-label="diminished"></span>';
    q = q.slice(1);
  }
  if (q) html += `<span class="q">${esc(q)}</span>`;
  if (v.inversion > 0) html += `<span class="slash">/${esc(v.bassNote.toString())}</span>`;
  return html;
}

let lastChordKey = '';
function renderChordBlock(v, focus) {
  const el = $('#chordBlock');
  const disp = run.config.display;
  if (!v || disp === 'BREATH_ONLY') { el.innerHTML = ''; lastChordKey = ''; return; }
  const key = `${v.displayName}|${lang}|${disp}`;
  if (key !== lastChordKey) {
    lastChordKey = key;
    const words = roleWords();
    const notes = disp === 'CHORD_AND_NOTES' ? `<div class="notes">${v.notesFromBass.map((n, i) => `<div class="note" data-role="${v.rolesFromBass[i]}"><span class="note-name">${esc(n.toString())}</span><span class="note-role">${esc(words[v.rolesFromBass[i]])}</span></div>`).join('')}</div>` : '';
    const k = v.info.roman && v.info.key ? t(`${v.info.roman} in ${v.info.key.tonic} ${modeWord(v.info.key.mode)}`, `${v.info.roman} в тональности ${v.info.key.tonic} ${modeWord(v.info.key.mode)}`) : '';
    el.innerHTML = `<div class="lead">${leadSheet(v)}</div>
      <div class="long">${esc(chordLongName(v.info.chord) + (v.inversion > 0 ? `, ${inversionName(v.inversion)}` : ''))}</div>${notes}${k ? `<div class="key">${esc(k)}</div>` : ''}`;
  }
  // Note brightness follows the focus, every frame.
  for (const n of el.querySelectorAll('.note')) {
    const role = Number(n.dataset.role);
    const gain = focus ? focus[role] : 1;
    const db = 20 * Math.log10(Math.max(gain, 1e-4));
    const name = n.firstChild;
    name.style.color = rgba(C.roles[role], 0.4 + 0.6 * smooth01((db + 24) / 30));
    name.style.fontWeight = db > 2 ? '700' : '600';
  }
}

const HAPTICS = { [Phase.INHALE]: [35, 70, 55], [Phase.EXHALE]: [110], [Phase.HOLD_IN]: [20], [Phase.HOLD_OUT]: [20] };

function frameSession() {
  const r = run;
  const tl = r.timeline;
  const tNow = sessionTime();
  const state = tl.stateAt(tNow);
  if (state.phase === Phase.DONE && !r.finished) { finishSession(); return; }

  // Vibration at each phase change (only while the page is visible).
  const pk = `${state.phase}:${state.cycle}`;
  if (pk !== r.lastPhaseKey) {
    if (r.lastPhaseKey && r.config.vibration && !r.paused && navigator.vibrate && HAPTICS[state.phase]) navigator.vibrate(HAPTICS[state.phase]);
    r.lastPhaseKey = pk;
  }

  const sound = r.config.sound;
  let dial = EMPTY_DIAL, voiced = null, focus = null;
  if (sound.tone === 'PAD') {
    const plan = r.track.plan;
    let slot = plan.slotFor(state);
    if (slot < 0) slot = Math.max(0, plan.slotFor(tl.stateAt((tl.endTime || tNow) - 0.01)));
    const cur = r.track.at(slot);
    const prev = slot > 0 ? r.track.at(slot - 1) : null;
    const into = plan.secondsIntoSlot(state, tl.pattern);
    const blend = blendSeconds(sound.harmony, tl.pattern.inhale, tl.pattern.exhale);
    const mix = into === Infinity ? 1 : smooth01(into / blend);
    if (sound.harmony.program !== 'DRONE') focus = FocusField.levels(sound.harmony, tNow, cur.info.chord.quality.isSeventh, r.focus);
    dial = dialBetween(cur, prev, mix, focus);
    voiced = cur;
  }
  const labels = r.config.display === 'BREATH_ONLY' || sound.tone !== 'PAD' ? 'NONE' : 'SOUNDING';
  drawDial($('#sessionDial'), state.lung, dial, labels);

  $('#phaseWord').textContent = phaseLabel(state.phase);
  const counted = state.phase === Phase.HOLD_IN || state.phase === Phase.HOLD_OUT || state.phase === Phase.READY;
  $('#phaseCount').textContent = counted ? String(Math.ceil(state.phaseRemaining)) : ' ';
  $('#sTime').textContent = r.paused ? t('Paused', 'Пауза')
    : state.breathingRemaining != null ? t(`${formatClock(state.breathingRemaining)} left`, `осталось ${formatClock(state.breathingRemaining)}`)
      : formatClock(state.breathingElapsed);
  renderChordBlock(voiced, focus);
  const show = r.paused || performance.now() < r.controlsUntil;
  const ctl = $('#controls');
  if (ctl.classList.contains('visible') !== show) ctl.classList.toggle('visible', show);
}

// Home preview: the dial breathing your pattern without sound, showing the first chord.
const preview = { dirty: true, chord: EMPTY_DIAL, timeline: null, t0: performance.now() };
function framePreview() {
  if (preview.dirty) {
    preview.dirty = false;
    const st = settings;
    preview.timeline = new BreathTimeline(patternOf(st), null, 0);
    preview.chord = st.sound.tone === 'PAD' ? dialBetween(new HarmonyTrack(st.sound.harmony).at(0), null, 1, null) : EMPTY_DIAL;
  }
  const tp = (performance.now() - preview.t0) / 1000;
  drawDial($('#previewDial'), preview.timeline.stateAt(tp).lung, preview.chord, 'ALL');
}

function loop() {
  if (current === 'session' && run && !run.finished) frameSession();
  else if (current === 'home') framePreview();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

showScreen('home');
requestAnimationFrame(loop);
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load(`400 15px ${FONT}`), document.fonts.load(`600 21px ${FONT}`)]).catch(() => {});
}
})();
