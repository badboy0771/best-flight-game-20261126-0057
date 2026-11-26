// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over.
//
// ?seed=N fixes the valley. ?shot=start|play|ring|end (with &seed=N) stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom, seedFromString } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_LAND, EVENT_OVER, EVENT_RING } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = params.get('seed') ?? '';
// ?seed=N takes a number; ?seed=word takes a name — both are shareable valleys.
const seed = /^\d+$/.test(seedParam)
  ? Number.parseInt(seedParam, 10)
  : seedParam
    ? seedFromString(seedParam)
    : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const state = world.state;
  window.__shotResult = {
    screen: scene.screen,
    score: state.score,
    rings: state.ringsHit,
    missed: state.ringsMissed,
    combo: state.bestCombo,
    time: Math.round(state.time),
    crashed: state.crashed,
    landed: state.landed,
  };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.terrainHeight);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    audio.unlock();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Thread the rings, mind the balloons.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    const s = world.state;
    announce(
      s.landed
        ? `Touchdown. Score ${s.score}. Best ${best}.`
        : s.crashed
          ? `Crashed. Score ${s.score}. Best ${best}.`
          : `Run complete. Score ${s.score}. Best ${best}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    const events = world.step(STEP, input.control(STEP), false);
    audio.update(world.state);
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring ${world.state.ringsHit}. Score ${world.state.score}.`);
    }
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_LAND) audio.land();
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, world.terrainHeight);
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The live play-test handle: window.__merapi exposes the world, the seed and the screen.
  window.__merapi = {
    world,
    seed,
    screen: () => screen,
    start: startGame,
  };

  announce('Merapi Valley Run. Press Space or click to take off.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
