# MIDNIGHT SHIFT: Mortimer's Forgotten Diner

A first-person, point-and-click survival horror game for the browser. You are the night guard at a
shut-down family diner. Survive from **12 AM to 6 AM** for five nights (plus a Challenge Night) while
four broken animatronics roam the building.

Everything you see and hear is generated at runtime: procedural canvas art, synthesized Web Audio
sound, no image or audio files, no backend, no API keys, and no runtime dependencies.

---

## Running the game

### Option A - with Node.js (recommended)

```bash
npm install
npm run dev
```

Vite starts on <http://localhost:5173> and opens the browser.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run check` | Automated rule checks: plays 240 random "chaos" nights and asserts the fairness invariants |
| `npm run simulate` | Balance simulator: a scripted player plays each night 100 times and reports win rate / power left |

Requires Node.js 18 or newer.

### Option B - without Node.js (Windows)

Double-click **`play.bat`**, or run `powershell -ExecutionPolicy Bypass -File play.ps1`.
This starts a tiny local web server on <http://localhost:8080> and opens the game. It works because the
game is plain ES modules with no build step. Any other static file server pointed at this folder works too.

> Opening `index.html` directly from disk (`file://`) does **not** work: browsers block ES modules there.

Audio starts after the first click (browser autoplay rules). Headphones are recommended because left/right
audio cues matter.

---

## Controls

| Input | Action |
| --- | --- |
| Mouse to screen edges / Left and Right arrows | Look around the office |
| Click **DOOR** buttons (or `Q` / `E`) | Close / open the left / right security door |
| Click **LIGHT** buttons (or `A` / `D`) | Toggle the left / right hallway light |
| Click the **MONITOR** bar (or `Space`) | Raise / lower the security monitor |
| Click **CAM** buttons on the map (or `1` to `8`) | Switch camera |
| `Esc` | Pause menu (Resume, Restart Night, Settings, Main Menu) |
| `F` | Toggle fullscreen |
| `M` | Mute / unmute |

Office controls are disabled while the monitor is up or moving, so you can't click anything hidden behind it by accident.

---

## How to survive

* **Power** starts at 100% and drains continuously. Usage (the bars, bottom left) is 1 for the
  office, plus 1 each for the monitor, each closed door and each active light. At 0% the doors open,
  the lights and cameras die, and a scripted blackout begins: darkness, then a music box and a face
  in the left doorway, then... unless 6 AM arrives first.
* **Hallway lights** reveal whoever is standing just outside a door. Footsteps and breathing on the
  left or right speaker tell you which side to check.
* **Doors** stop everything, but they are expensive. Animatronics that find a door shut give up after
  a few seconds and walk away. Open the door again when the light shows the hall is clear.
* **Cameras** let you track the animatronics as they move. Movement causes a burst of interference
  on the cameras involved, so nothing teleports without a trace.
* The **clock** (top right) runs from 12 AM to 6 AM. A night lasts 7 real minutes by default
  (4, 6 or 8 in Settings).

### The animatronics

| | Character | Route | Threat profile |
| --- | --- | --- | --- |
| A | **Mortimer the Bear** | Stage -> Dining -> either hall (sometimes via Kitchen/Service) -> either door | Slow and strategic, and gets bolder each hour. **Never moves while you watch his camera.** Hides in shadows (sometimes only his eyes show, sometimes nothing). His laugh as he moves is sometimes thrown to the *wrong* speaker. If he's at an open door and you keep staring at the monitor, he slips in. Also stars in the power-out sequence. |
| B | **Hopscotch the Rabbit** | Stage / Backstage -> Dining -> West Hall -> **left door** | Fast and restless. Gets bolder the longer you go without checking the cameras. |
| C | **Pippa the Parrot** | Stage -> Dining -> Kitchen -> Service Corridor -> East Hall -> **right door** | A distraction specialist. Clatters pots in the kitchen, knocks random cameras offline, and loves to shove her face into the lens when you least expect it. |
| D | **Scraps the Hound** | Storage (CAM 06) -> sprints down the West Hall -> **left door** | Advances through 4 stages behind the curtain: hidden, peeking, leaning out, gone. Watching CAM 06 freezes him and can drive him back; ignoring him makes him much faster. When he breaks out you'll hear his collar jingle and his feet pound down the left hall, and you have a few seconds to shut the left door. A shut door makes him bang on it (costs power); an open one is fatal. Watching him run on CAM 03 only makes him faster. |

From Night 3 the animatronics **coordinate**: keeping one door shut for a long time makes the ones on
the other side bolder.

### Nights

Nights 1-5 get progressively harder (AI levels, movement frequency, shorter waits at the door,
faster sprints, more power pressure). Beating Night 5 unlocks **Night 6 - Challenge**.
Progress, completed nights and settings are saved in `localStorage`.

Balance snapshot from `npm run simulate`. It uses a scripted, slightly careless bot that sees only what a player
sees, reacts with a human-like delay, and doesn't use every trick:

| Night | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Bot win rate | 100% | 100% | ~99% | ~90% | ~45% | ~10% |

---

## Settings

Master / effects / ambience volume, mute, visual effects level (full / reduced / minimal grain,
scanlines and glitches), **reduced flashing** (replaces jumpscare flashes with dark pulses), screen
shake, night length, Night 1 tutorial on/off, developer debug overlay, and fullscreen.
**Reset Progress** asks for confirmation and keeps your settings.

## Debug mode

Enable *Developer debug overlay* in Settings, or open the game with `?debug=1`. The overlay shows each
animatronic's AI state, room, level, next-move timer and last dice roll, plus power usage and drain
rate, the clock and the RNG seed. Debug keys while playing:

`]` skip an hour, `P` set power to 3%, `O` restore power, `V` jump to 6 AM, `K` force a death, `R` force Scraps to sprint.

Add `?seed=1234` to make animatronic behaviour reproducible.

---

## Architecture

```
index.html              DOM shell: canvases, HUD, menus, dialogs
src/
  main.js               Game controller: screen state machine, main loop, input, event wiring
  config.js             All tunables: night difficulty tables, power, timings, default settings
  styles.css            Presentation (fixed 1280x720 stage scaled to the window)
  core/
    rng.js              Seeded PRNG (mulberry32)
    emitter.js          Tiny event emitter
    save.js             localStorage save/load with validation + corruption recovery
  world/
    map.js              Rooms, connections, camera ids, map layout, path distances
    session.js          NightSession: clock, power, doors/lights/monitor, cameras, AI, power-out.
                        Pure logic with no DOM, so it also runs headless in Node.
  ai/
    animatronic.js      Base state machine: IDLE / ROAMING / MOVING / APPROACHING / WAITING / ATTACKING / RETREATING
    characters.js       Bear, Rabbit, Bird, Runner behaviours (CHARGING state for the Runner)
  render/
    painter.js          Canvas helpers + a small pinhole projector used to build rooms in fake 3D
    characters.js       Procedural animatronic artwork (full body + head for jumpscares)
    scenes.js           The 8 camera rooms, baked once to offscreen canvases with light maps
    cameraView.js       CCTV feed: scene, characters, colour grade, static, interference, labels
    office.js           Pannable office: doors, shutters, lights, fan, lamp, hallways, power-out
    jumpscare.js        Per-character jumpscare motion, shake and (optional) flashes
    effects.js          Grain, static, scanlines, vignette, tearing
    backdrops.js        Menu / game-over / dawn backgrounds
  audio/
    audio.js            Web Audio synth: ambience beds, positional SFX, music box, screams
  ui/
    ui.js               Menus, settings, HUD, camera map, tooltips, confirm dialog, debug panel
    tutorial.js         Interactive first-night tutorial (freezes the night until finished)
scripts/
  simulate.js           Headless balance simulator (bot player)
  check.js              Headless invariant tests
play.ps1 / play.bat     Zero-install local server for Windows
```

**How the AI works.** Every animatronic gets a *movement opportunity* every ~5 s (with jitter). It
rolls a d20 against its AI level, which is the night's base level plus hourly increases plus
behaviour modifiers (camera neglect, flanking, hour of night). On a success it picks a connected room,
weighted toward its target door with some sideways and backward moves so patterns aren't
predictable. Moving takes about a second, during which the cameras on both ends show interference.
At a door it lingers. An open door past the linger time means an attack; a closed door makes it
retreat. Attacks can never happen through a closed door: `npm run check` verifies this along with the
other invariants (no teleporting, power stays within 0-100%, and so on).

**Data flow.** `NightSession` emits events (`move`, `atDoor`, `runnerSprint`, `doorBang`,
`powerOut`, `jumpscare`, `win`, ...). `main.js` subscribes and turns them into positional sounds,
camera interference, screen shake and UI changes. Renderers read session state each frame.

## Known limitations

* Desktop browsers with a mouse are the target. Touch devices can tap the controls, but there is no
  edge-panning on touch (use the arrow keys or a mouse).
* The fonts (Special Elite, VT323) load from Google Fonts. Offline, the game falls back to system
  monospace fonts and still works.
* All art and audio are procedural, so the style is stylised rather than photo-realistic.
