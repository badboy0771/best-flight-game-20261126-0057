[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/badboy0771/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/badboy0771/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Merapi Valley Run

A chase-view flight game for the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057): fly a prop plane down a river valley, thread 22 glowing rings, dodge hot-air balloons and the mountain walls, and land on the runway if you can — all in 150 seconds.

## How to play

- **↑ / ↓ or W / S** — pitch (climb / dive)
- **← / → or A / D** — bank and turn
- **SHIFT** — throttle up, **CTRL** — throttle down
- **Mouse** — steer toward the pointer
- **SPACE / click** — take off / restart, **P** — pause

Score 100 points per ring, with a combo multiplier up to x3 for consecutive rings. A gentle runway landing pays +250. Flying into terrain, a mountain or a balloon ends the run. Wind gusts push the plane sideways — watch the warning. Close to the ground, the stick refuses a hard dive.

Medals at the end of a run: 20+ rings Gold Wings, 15+ Silver, 10+ Bronze, 5+ Valley Flier.

## The valley

A seeded procedural valley: patchwork fields, a winding river, forested hills, rock walls and snow caps, a runway at the start, and 22 rings on a winding line. The same seed always builds the same valley, so every screenshot is reproducible.

## Tech

- Plain static files under `game/` — no build step, no network request, no library.
- Pseudo-3D chase view on a 2D canvas: the valley floor renders as projected quads, rings and balloons as projected circles, with a full cockpit HUD (compass tape, airspeed in knots, altitude AGL in m/ft, artificial horizon, throttle, timer, ring counter, score).
- Synthesised WebAudio sound (engine hum, wind, ring chime, crash thud) — no audio files.
- `main.ts` (Node 22) copies `game/` + `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.
- Screenshots are real renders of the game's own code, staged by `game/src/shots.js` (`?shot=start|play|ring|end&seed=N`) and captured by `shots.mjs` in headless Chrome.

## Local checks

- `node shots.mjs` — 4 screenshots (1280×720, each ≤ 256 KiB), end-shot soak across 6 seeds, and a 25-second live play-test with real key events. All pass with 0 console errors.
- Autopilot soak (Node, 12 seeds): every seed completes the full 150-second run, scores 1,316–4,271.
- `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` — deterministic; two runs write identical bytes.

## License

MIT
