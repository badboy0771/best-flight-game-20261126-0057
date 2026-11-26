// The screenshot scenes behind ?shot=start|play|ring|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a simple autopilot (aim at the next
// ring's centre, hold the throttle at cruise), so the frame is what a real flight looks like and
// the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { clamp } from './random.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 34;
const END_LIMIT_SECONDS = 155;

/** Steer toward the next ring: pitch to its height, turn to its bearing. */
function autopilot(state, world) {
  const ring = state.rings[state.nextRing];
  let pitch = 0;
  let turn = 0;
  if (ring) {
    const dz = Math.max(1, ring.z - state.z);
    const bearing = Math.atan2(ring.x - state.x, dz) - state.heading;
    turn = clamp(bearing * 2.2, -1, 1);
    const wantY = ring.y;
    const dy = wantY - state.y;
    pitch = clamp(dy * 0.03 + Math.sin(state.pitch) * 0.2, -1, 1);
  }
  // Look ahead: climb over the highest ground in the next 300 m, with margin.
  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);
  let highest = -Infinity;
  for (const d of [60, 120, 200, 300]) {
    const h = world.terrainHeight(state.x + sinH * d, state.z + cosH * d);
    if (h > highest) highest = h;
  }
  const safeY = highest + 26;
  if (state.y < safeY) pitch = Math.max(pitch, 0.75);
  else if (state.y - state.ground < 14) pitch = Math.max(pitch, 0.55);
  // Dodge balloons ahead: steer to the side with more room, and climb or dive away.
  // The terrain floor wins: never dive into a hill to pass under a balloon.
  for (const b of state.balloons) {
    const dz = b.z - state.z;
    if (dz < 0 || dz > 300) continue;
    const dx = b.x - state.x;
    const dy = b.y - state.y;
    if (Math.abs(dx) < 45 && Math.abs(dy) < 30) {
      turn = dx >= 0 ? -1 : 1;
      if (dy >= 0) pitch = state.y > safeY + 15 ? -0.9 : Math.max(pitch, 0.75);
      else pitch = Math.max(pitch, 0.9);
      break;
    }
  }
  return { pitch, turn, throttleUp: state.throttle < 0.78, throttleDown: false, mouse: null };
}

/**
 * Set `world` to the named scene (start, play, ring or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'ring' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, autopilot(state, world), true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  let over = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    const events = world.step(STEP, autopilot(state, world), false);
    if (events & EVENT_OVER) {
      over = true;
      break;
    }
    if (name === 'ring') {
      // Freeze just before the next ring, with it large in the frame.
      const ring = state.rings[state.nextRing];
      if (ring && ring.z - state.z < 55) break;
    }
  }
  const screen = over ? SCREEN_OVER : SCREEN_PLAY;
  return { screen, best: state.score };
}
