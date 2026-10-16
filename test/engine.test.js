const assert = require('assert');
const E = require('../src/engine.js');
const { Note, Chord, Quality, HarmonyPlan, HarmonyTrack, BreathTimeline, FocusField, HARMONY_DEFAULTS, blendSeconds, mod12 } = E;

const H = (o = {}) => ({ ...HARMONY_DEFAULTS, ...o });
const names = (h, n) => Array.from({ length: n }, (_, i) => new HarmonyPlan(h).chordAt(i).chord.name);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

test('spellingByLetter', () => {
  assert.strictEqual(new Chord(Note.parse('A'), Quality.MAJOR).tones.join(' '), 'A C♯ E');
  assert.strictEqual(new Chord(Note.parse('E♭'), Quality.DOMINANT7).tones.join(' '), 'E♭ G B♭ D♭');
  assert.strictEqual(new Chord(Note.parse('B'), Quality.HALF_DIMINISHED7).tones.join(' '), 'B D F A');
  assert.strictEqual(new Chord(Note.parse('C'), Quality.DIMINISHED7).tones.join(' '), 'C E♭ G♭ B♭♭');
});

test('circleOfFourthsNames', () => {
  assert.deepStrictEqual(names(H({ program: 'CIRCLE' }), 12), ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'B', 'E', 'A', 'D', 'G']);
  assert.deepStrictEqual(names(H({ program: 'CIRCLE', circleQuality: 'DOMINANT7', keyRoot: 7 }), 3), ['G7', 'C7', 'F7']);
});

test('diatonicCircles', () => {
  assert.deepStrictEqual(names(H({ program: 'IN_KEY' }), 7), ['C', 'F', 'B°', 'Em', 'Am', 'Dm', 'G']);
  assert.deepStrictEqual(names(H({ program: 'IN_KEY', sevenths: true }), 7), ['Cmaj7', 'Fmaj7', 'Bm7♭5', 'Em7', 'Am7', 'Dm7', 'G7']);
  assert.deepStrictEqual(names(H({ program: 'IN_KEY', keyRoot: 9, keyMode: 'MINOR', sevenths: true }), 7), ['Am7', 'Dm7', 'G7', 'Cmaj7', 'Fmaj7', 'Bm7♭5', 'E7']);
  assert.strictEqual(names(H({ program: 'IN_KEY', keyRoot: 6 }), 3)[2], 'E♯°');
});

test('stayingInKeyVersusTouring', () => {
  const key = (k) => `${k.tonic} ${k.mode}`;
  assert.strictEqual(key(new HarmonyPlan(H({ program: 'IN_KEY' })).chordAt(30).key), 'C MAJOR');
  const tour = new HarmonyPlan(H({ program: 'IN_KEY', tourKeys: true }));
  assert.strictEqual(key(tour.chordAt(13).key), 'C MAJOR');
  assert.strictEqual(key(tour.chordAt(14).key), 'G MAJOR');
  assert.strictEqual(tour.chordAt(14).roman, 'I');
});

test('slotsFollowTheBreath', () => {
  const tl = new BreathTimeline({ inhale: 5.5, holdIn: 0, exhale: 5.5, holdOut: 0 }, null, 0);
  const half = new HarmonyPlan(H({ timing: 'HALF_BREATH' }));
  const whole = new HarmonyPlan(H({ timing: 'BREATH' }));
  assert.strictEqual(half.slotFor(tl.stateAt(1)), 0);
  assert.strictEqual(half.slotFor(tl.stateAt(6)), 1);
  assert.strictEqual(half.slotFor(tl.stateAt(12)), 2);
  assert.strictEqual(whole.slotFor(tl.stateAt(6)), 0);
  assert.strictEqual(whole.slotFor(tl.stateAt(12)), 1);
});

test('voiceLeadingIsSmoothAndComplete', () => {
  for (const bass of ['ROOTS', 'SMOOTH']) for (const sevenths of [false, true]) {
    const track = new HarmonyTrack(H({ program: 'IN_KEY', sevenths, tourKeys: true, bass }));
    for (let slot = 0; slot < 60; slot++) {
      const v = track.at(slot);
      const chord = v.info.chord;
      const heard = new Set(v.midi.map(mod12));
      chord.pitchClasses.forEach((pc, i) => {
        if (!(chord.quality.isSeventh && i === 2)) assert.ok(heard.has(pc), `${chord.name} missing ${pc}`);
      });
      for (let i = 1; i <= 4; i++) assert.ok(v.midi[i] >= 52 && v.midi[i] <= 76);
      if (bass === 'ROOTS') assert.strictEqual(v.inversion, 0);
      if (slot > 0) {
        const p = track.at(slot - 1).midi;
        for (let i = 1; i <= 4; i++) assert.ok(Math.abs(v.midi[i] - p[i]) <= 7, `voice ${i} jumped`);
      }
    }
  }
});

test('inversionsAreNamedAndListedFromTheBass', () => {
  const track = new HarmonyTrack(H({ program: 'IN_KEY', sevenths: true, bass: 'SMOOTH' }));
  assert.strictEqual(track.at(0).inversion, 0);
  const inverted = Array.from({ length: 30 }, (_, i) => track.at(i)).find((v) => v.inversion > 0);
  assert.ok(inverted.displayName.includes('/'));
  assert.ok(inverted.bassNote.equals(inverted.notesFromBass[0]));
});

test('blendRange', () => {
  assert.ok(Math.abs(blendSeconds(H({ blend: 0 }), 5.5, 5.5) - 0.15) < 1e-9);
  assert.ok(Math.abs(blendSeconds(H({ blend: 1 }), 5.5, 5.5) - 4.4) < 1e-9);
});

test('focusIsDeterministicAndNeverSilencesEverything', () => {
  const h = H({ focus: 'WANDER', focusDepth: 1, focusSeed: 7 });
  const a = new Float64Array(4), b = new Float64Array(4);
  for (let t = 0; t < 600; t += 0.37) {
    FocusField.levels(h, t, false, a);
    FocusField.levels(h, t, false, b);
    assert.deepStrictEqual(Array.from(a), Array.from(b));
    assert.ok(Math.max(a[0], a[1], a[2]) >= 1 - 1e-9);
  }
  const off = new Float64Array(4);
  FocusField.levels(H(), 12, true, off);
  assert.ok(Array.from(off).every((x) => x === 1));
});

test('spotlightThirdBringsTheThirdForward', () => {
  const l = new Float64Array(4);
  FocusField.levels(H({ focus: 'THIRD', focusDepth: 1 }), 10, false, l);
  assert.ok(l[1] > 2);
  assert.ok(l[0] < 0.5);
});

test('rolesMatchNotes', () => {
  const track = new HarmonyTrack(H({ program: 'IN_KEY', sevenths: true, bass: 'SMOOTH' }));
  for (let slot = 0; slot < 20; slot++) {
    const v = track.at(slot);
    v.midi.forEach((m, i) => assert.strictEqual(v.info.chord.pitchClasses[v.roles[i]], mod12(m)));
    v.notesFromBass.forEach((n, i) => assert.ok(v.info.chord.tones[v.rolesFromBass[i]].equals(n)));
  }
});

test('timelineRoundsUpToWholeBreaths', () => {
  const tl = new BreathTimeline({ inhale: 4, holdIn: 7, exhale: 8, holdOut: 0 }, 60, 3);
  assert.strictEqual(tl.breathingSeconds, 76); // 4 cycles of 19 s
  assert.strictEqual(tl.stateAt(3 + 4 + 1).phase, E.Phase.HOLD_IN);
  assert.strictEqual(tl.stateAt(80).phase, E.Phase.DONE);
});

// Render a whole minute in every sound mode: no NaN, no clipping, and fast enough for a phone.
test('synthRendersCleanAndFast', () => {
  const sr = 48000;
  const modes = [
    { tone: 'PAD', harmony: H({ program: 'IN_KEY', focus: 'WANDER', focusSeed: 123, bass: 'SMOOTH', sevenths: true }) },
    { tone: 'PAD', harmony: H({ program: 'DRONE' }) },
    { tone: 'BOWLS', harmony: H() },
  ];
  for (const m of modes) {
    const eng = new E.SessionEngine(sr, {
      pattern: { inhale: 5.5, holdIn: 0, exhale: 5.5, holdOut: 0 }, minutes: 1,
      sound: { tone: m.tone, air: true, softTurnaround: true, volume: 0.8, harmony: m.harmony },
    });
    const L = new Float32Array(128), R = new Float32Array(128);
    let peak = 0, sumSq = 0, count = 0;
    const t0 = process.hrtime.bigint();
    for (let f = 0; f < sr * 60; f += 128) {
      eng.render(L, R, f, 128);
      for (let i = 0; i < 128; i++) {
        if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) throw new Error('NaN in ' + m.tone);
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
        sumSq += L[i] * L[i]; count++;
      }
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const rms = Math.sqrt(sumSq / count);
    console.log(`   ${m.tone}/${m.harmony.program}: 60 s rendered in ${ms.toFixed(0)} ms (${(60000 / ms).toFixed(0)}× real time), peak ${peak.toFixed(2)}, rms ${rms.toFixed(3)}`);
    assert.ok(peak <= 1 && rms > 0.01);
  }
});

console.log(`\n${passed} tests passed`);
