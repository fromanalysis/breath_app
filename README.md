# Breath (web)

**Open it:** https://fromanalysis.github.io/breath_app/

A breathing pacer that plays chords with your breath, running entirely in the browser.
This is the web version of the Breath Android app: the same breath timeline, harmony,
voice leading and pad synthesizer, ported line by line from the Kotlin code to JavaScript.

## What's in it

- **Sessions:** Everyday, Wind down, Sleep, Around the circle, Key tour, Inside the chord.
- **Breathing:** Resonance 5.5–5.5, Slow resonance 6–6, Calming 4–6, Box, 4-7-8, or custom timings.
- **Music:** pad, singing bowls or silence; a circle in any key (triads or sevenths, optionally
  moving through keys), the circle of fourths in ten chord colours, or one drone chord. Chord
  timing, blend, bass motion with inversions, and note focus work the same as in the app.
- **The tuning dial,** with chord, notes and roles shown in the same colours as the app.
- **English and Russian.**

Settings are kept in the browser on each device. Nothing is sent anywhere.

## How the sound works

The synthesizer runs in an **AudioWorklet**, on the browser's audio thread. The page reads the
audio clock (`AudioContext.getOutputTimestamp`), so the dial, words and vibration follow what you
hear, as in the Android app where the AudioTrack position is the master clock. If a browser has
no AudioWorklet, the page falls back to a ScriptProcessor running the same engine on the page thread.

## Screen-off test

1. Open **Settings** (the gear) and turn off **Keep the screen on**.
2. Start a session and lock the phone for a few minutes.
3. Unlock it. A note says how long the screen was off and whether the sound kept going.

Browsers differ here. Android browsers usually keep Web Audio playing while the screen is
locked; iOS Safari usually stops it. If the browser stopped the sound, the session waits,
paused, at the point where it stopped.

## Put it on GitHub Pages

No build step is needed: `index.html` is the whole app.

**With the GitHub website:**

1. Create a new **public** repository (this one is `breath_app`).
2. Choose **Add file → Upload files** and upload everything in this folder
   (at least `index.html`, `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `.nojekyll`).
3. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**,
   branch `main`, folder `/ (root)`, and save.
4. After a minute the app is at `https://<your-username>.github.io/<repository>/`.

**With git:**

```sh
git init -b main
git add .
git commit -m "Breath web prototype"
git remote add origin https://github.com/<your-username>/<repository>.git
git push -u origin main
```

Then enable Pages as in step 3.

On Android you can then choose **Add to home screen** in the browser menu, and it opens like an app.

## Changing the code

The source is in `src/`:

- `src/engine.js`: timeline, harmony, voicing, note focus and the synthesizer (runs in the page and in the AudioWorklet)
- `src/app.js`: screens, settings, the dial drawing and the audio clock
- `src/body.html`: markup and styles

After editing, rebuild `index.html` and run the engine tests (Python 3 and Node.js):

```sh
python3 build.py
node test/engine.test.js
```

The tests are the Android app's harmony unit tests, ported, plus a render check of every sound mode.
