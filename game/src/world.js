// The world: a valley with a winding river, patchwork fields, forested hills, rock walls and
// snow caps, a runway at the start, a line of glowing rings to fly through and hot-air balloons
// to dodge. The plane flies forward (+z); the physics step is fixed at 1/60 s.
import {
  BALLOONS,
  GUSTS,
  PLANE,
  RINGS,
  RUN_SECONDS,
  RUNWAY,
  STEP,
  THROTTLE,
  VALLEY,
} from './config.js';
import { clamp, noise1, noise2, smoothstep } from './random.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LAND = 4;
export const EVENT_OVER = 8;
export const EVENT_MISS = 16;

function makeHills(random) {
  const hills = [];
  for (let i = 0; i < 26; i += 1) {
    hills.push({
      x: random.range(-150, 150),
      z: random.range(600, 6200),
      r: random.range(55, 130),
      h: random.range(22, 58),
    });
  }
  return hills;
}

function makeRings() {
  const rings = [];
  for (let i = 0; i < RINGS.count; i += 1) {
    const z = RINGS.firstZ + i * RINGS.spacing;
    rings.push({
      x: 95 * Math.sin(z * 0.0016) + 18 * Math.sin(z * 0.0041 + 1.3),
      y: 62 + 30 * Math.sin(z * 0.0021 + 2.0) + 10 * Math.sin(z * 0.0053),
      z,
      r: RINGS.radius,
      passed: false,
      scored: false,
    });
  }
  return rings;
}

function makeBalloons(random, rings) {
  const balloons = [];
  // A balloon never sits on the ring line: the pilot must be able to thread the ring
  // without choosing between the points and a crash.
  function clearOfRings(x, y, z) {
    for (let i = 0; i + 1 < rings.length; i += 1) {
      const a = rings[i];
      const b = rings[i + 1];
      if (z < a.z - 60 || z > b.z + 60) continue;
      const t = Math.max(0, Math.min(1, (z - a.z) / (b.z - a.z)));
      const rx = a.x + (b.x - a.x) * t;
      const ry = a.y + (b.y - a.y) * t;
      if (Math.abs(x - rx) < 55 && Math.abs(y - ry) < 48) return false;
    }
    return true;
  }
  let guard = 0;
  while (balloons.length < BALLOONS.count && guard < 400) {
    guard += 1;
    const candidate = {
      x: random.range(-170, 170),
      y: random.range(48, 118),
      z: random.range(BALLOONS.minZ, BALLOONS.maxZ),
      r: BALLOONS.radius,
      hue: random.pick(['#e5534b', '#f2a541', '#4f9de0', '#7ec850', '#b678e0']),
      bob: random.range(0, Math.PI * 2),
    };
    if (clearOfRings(candidate.x, candidate.y, candidate.z)) balloons.push(candidate);
  }
  return balloons;
}

/** The river winds down the valley floor. */
export function riverX(z) {
  return 70 * Math.sin(z * 0.0035 + 0.8) + 20 * Math.sin(z * 0.0011 + 2.2);
}

/** Terrain height (metres above sea level) at lateral x and distance z. */
export function terrainHeight(x, z, hills) {
  const ax = Math.abs(x);
  // Gentle undulation on the valley floor.
  let h = 3.5 * Math.sin(z * 0.008 + 1.7) * Math.sin(x * 0.02 + 0.5)
    + 2.0 * (noise2(x * 0.02, z * 0.02) - 0.5) * 2;
  // Scattered hills.
  for (let i = 0; i < hills.length; i += 1) {
    const hill = hills[i];
    const dx = x - hill.x;
    const dz = z - hill.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < hill.r * hill.r * 4) {
      const d = Math.sqrt(d2) / hill.r;
      h += hill.h * Math.exp(-d * d * 1.6);
    }
  }
  // The valley walls rise steeply past the floor, with a noisy ridgeline.
  const wall = smoothstep(VALLEY.wallStart, VALLEY.wallTop, ax);
  h += wall * (VALLEY.wallHeight * (0.75 + 0.5 * noise1(z * 0.004 + ax * 0.01)));
  // The river cuts a shallow channel.
  const rx = riverX(z);
  const riverDip = Math.exp(-((x - rx) * (x - rx)) / (2 * 14 * 14));
  h -= riverDip * 1.6;
  return h;
}

export function createWorld(random) {
  const hills = makeHills(random);
  const rings = makeRings();
  const balloons = makeBalloons(random, rings);
  const state = freshState();
  // The renderer and the screenshot autopilot read the rings and balloons off the state,
  // so they ride along with it (reset() only overwrites freshState()'s own keys).
  state.rings = rings;
  state.balloons = balloons;

  function freshState() {
    return {
      time: 0,
      x: 0,
      y: PLANE.startAltitude,
      z: 0,
      heading: 0,
      speed: PLANE.startSpeed,
      throttle: THROTTLE.start,
      pitch: 0,
      roll: 0,
      score: 0,
      ringsHit: 0,
      ringsMissed: 0,
      combo: 0,
      bestCombo: 0,
      nextRing: 0,
      crashed: false,
      landed: false,
      finished: false,
      crashReason: '',
      gust: 0,
      gustTimer: GUSTS.everySeconds,
      gustTimeLeft: 0,
      ground: 0,
    };
  }

  function reset() {
    Object.assign(state, freshState());
    for (const ring of rings) {
      ring.passed = false;
      ring.scored = false;
    }
    state.ground = terrainHeight(0, 0, hills);
  }

  /**
   * Advance the simulation one fixed step.
   * control: { pitch: -1..1 (up positive), turn: -1..1 (right positive),
   *   throttleUp, throttleDown, mouse: {x, y} in -1..1 or null }
   */
  function step(dt, control, attract) {
    if (state.finished || state.crashed) return 0;
    let events = 0;
    state.time += dt;

    if (attract) {
      // Title screen: the plane sits on the runway, engine idling.
      state.x = 0;
      state.y = 2.5;
      state.z = 40;
      state.heading = 0;
      state.speed = 0;
      state.throttle = 0.25;
      state.pitch = 0;
      state.roll = 0;
      state.ground = terrainHeight(0, 40, hills);
      return 0;
    }

    // --- Throttle and speed ---
    if (control.throttleUp) state.throttle = clamp(state.throttle + THROTTLE.step * dt, 0, 1);
    if (control.throttleDown) state.throttle = clamp(state.throttle - THROTTLE.step * dt, 0, 1);
    const targetSpeed = PLANE.minSpeed + (PLANE.maxSpeed - PLANE.minSpeed) * state.throttle;
    state.speed += clamp(targetSpeed - state.speed, -PLANE.accel * dt, PLANE.accel * dt);

    // --- Stick: keyboard, or the mouse when it is steering ---
    let pitchIn = control.pitch;
    let turnIn = control.turn;
    if (control.mouse) {
      pitchIn = clamp(-control.mouse.y * 1.4, -1, 1);
      turnIn = clamp(control.mouse.x * 1.4, -1, 1);
    }
    const targetPitch = pitchIn * PLANE.maxPitch;
    // Close to the ground the stick will not push the nose down hard: a soft
    // terrain-avoidance assist, so one careless dive does not end the run.
    const safePitch = state.y - state.ground < 15 ? Math.max(targetPitch, -0.2) : targetPitch;
    state.pitch += clamp(safePitch - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    const targetRoll = turnIn * PLANE.maxRoll;
    state.roll += clamp(targetRoll - state.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
    // Banking right (positive roll) turns the nose right: heading grows toward +x.
    state.heading += state.roll * PLANE.turnRate * dt * (0.4 + 0.6 * (state.speed / PLANE.maxSpeed));

    // --- Wind gusts push the plane sideways for a couple of seconds ---
    state.gustTimer -= dt;
    if (state.gustTimer <= 0) {
      state.gustTimer = GUSTS.everySeconds + (state.time % 3);
      state.gustTimeLeft = GUSTS.duration;
      state.gust = (state.time % 2 < 1 ? 1 : -1) * GUSTS.maxPush * (0.5 + 0.5 * ((state.time * 7) % 1));
    }
    if (state.gustTimeLeft > 0) {
      state.gustTimeLeft -= dt;
      state.x += state.gust * dt;
    }

    // --- Move ---
    const prevZ = state.z;
    state.z += Math.cos(state.heading) * state.speed * dt;
    state.x += Math.sin(state.heading) * state.speed * dt;
    let vy = Math.sin(state.pitch) * state.speed * PLANE.climbFactor;
    if (state.speed < PLANE.stallSpeed) vy -= (PLANE.stallSpeed - state.speed) * 0.4;
    state.y += vy * dt;
    if (state.y < 1.5) state.y = 1.5;

    // The valley is wide but not endless: the walls nudge a stray pilot back.
    if (Math.abs(state.x) > 400) {
      state.heading += (state.x > 0 ? -1 : 1) * 0.5 * dt;
    }

    state.ground = terrainHeight(state.x, state.z, hills);

    // --- Rings: crossed this step? ---
    for (let i = state.nextRing; i < rings.length; i += 1) {
      const ring = rings[i];
      if (prevZ < ring.z && state.z >= ring.z) {
        ring.passed = true;
        state.nextRing = i + 1;
        const dx = state.x - ring.x;
        const dy = state.y - ring.y;
        if (Math.sqrt(dx * dx + dy * dy) < ring.r) {
          ring.scored = true;
          state.ringsHit += 1;
          state.combo += 1;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          const gain = RINGS.points * (1 + Math.min(state.combo - 1, 4) * 0.5);
          state.score += Math.round(gain);
          events |= EVENT_RING;
        } else {
          state.ringsMissed += 1;
          state.combo = 0;
          events |= EVENT_MISS;
        }
      } else if (ring.z > state.z) break;
    }

    // --- Balloons: a hit is a crash ---
    for (const b of balloons) {
      const dx = state.x - b.x;
      const dy = state.y - b.y;
      const dz = state.z - b.z;
      if (dx * dx + dy * dy + dz * dz < (b.r + 4) * (b.r + 4)) {
        state.crashed = true;
        state.crashReason = 'balloon';
        events |= EVENT_CRASH | EVENT_OVER;
        return events;
      }
    }

    // --- Terrain: too low means a crash — unless it is a gentle runway landing ---
    const onRunway = Math.abs(state.x) < RUNWAY.halfWidth && state.z >= RUNWAY.z0 && state.z <= RUNWAY.z1;
    if (state.y <= state.ground + PLANE.clearance) {
      if (onRunway && Math.abs(vy) < 3.5 && state.speed < 58) {
        state.landed = true;
        state.finished = true;
        state.score += 250;
        events |= EVENT_LAND | EVENT_OVER;
      } else {
        state.crashed = true;
        state.crashReason = state.ground > 60 ? 'mountain' : 'ground';
        events |= EVENT_CRASH | EVENT_OVER;
      }
      return events;
    }

    // --- The clock ends the run ---
    if (state.time >= RUN_SECONDS) {
      state.finished = true;
      state.score += Math.round(state.y);
      events |= EVENT_OVER;
    }
    return events;
  }

  return { state, hills, rings, balloons, reset, step, terrainHeight: (x, z) => terrainHeight(x, z, hills) };
}

export { STEP };
