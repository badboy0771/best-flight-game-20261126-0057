// The renderer: a pseudo-3D chase view. The sky, sun, ridges and clouds paint first, then the
// valley floor as projected quads (far to near), then rings, balloons and the runway, then the
// plane itself banking in the foreground, then the cockpit instruments and the HUD.
// Screens: title, play, paused, over (landed / crashed / time up).
import { CAMERA, FIELD, MEDALS, PALETTE, FONT, RINGS, RUN_SECONDS, RUNWAY } from './config.js';
import { clamp, noise1 } from './random.js';
import { riverX } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Focal length in logical pixels (about a 55-degree vertical field of view). */
const FOCAL = CAMERA.focal;
const HORIZON_Y = CAMERA.horizonY;
const CENTER_X = FIELD.width / 2;
/** Depth rows, near to far (metres ahead of the camera). */
const ROWS = CAMERA.rows;
const FAR = CAMERA.far;
const COLUMNS = CAMERA.columns;
const GROUND_HALF = CAMERA.groundHalf;

function groundColor(x, z, h, hills) {
  const ax = Math.abs(x);
  if (h > 128) return PALETTE.snow;
  if (h > 88) return PALETTE.rock;
  if (z >= RUNWAY.z0 && z <= RUNWAY.z1 && ax < RUNWAY.halfWidth) {
    // Runway asphalt, with a dashed centreline.
    const dash = Math.floor(z / 18) % 2 === 0;
    if (ax < 1.2 && dash) return PALETTE.runwayMark;
    return PALETTE.runway;
  }
  const rx = riverX(z);
  if (Math.abs(x - rx) < 13) return PALETTE.river;
  if (h > 40) return PALETTE.forest;
  // Patchwork fields, hashed by 45 m squares.
  const hx = Math.floor(x / 45);
  const hz = Math.floor(z / 45);
  const pick = Math.abs((hx * 73856093 + hz * 19349663) % 4);
  return [PALETTE.fieldA, PALETTE.fieldB, PALETTE.fieldC, PALETTE.fieldD][pick];
}

function compassLabel(heading) {
  const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return { deg: Math.round(deg), point: points[Math.round(deg / 45) % 8] };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const scaleX = () => canvas.width / FIELD.width;
  const scaleY = () => canvas.height / FIELD.height;

  function setup() {
    ctx.setTransform(scaleX(), 0, 0, scaleY(), 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  /** Project a world point to logical screen coordinates; null when behind the camera. */
  function project(wx, wy, wz, cam) {
    const dx = wx - cam.x;
    const dz = wz - cam.z;
    const sinH = Math.sin(cam.heading);
    const cosH = Math.cos(cam.heading);
    const fwd = dx * sinH + dz * cosH;
    if (fwd < 2) return null;
    const right = dx * cosH - dz * sinH;
    const scale = FOCAL / fwd;
    let sx = CENTER_X + right * scale;
    let sy = HORIZON_Y + (cam.y - wy) * scale + cam.pitch * FOCAL * 0.85;
    // Roll the whole view around the centre of the screen.
    const roll = cam.roll * 0.55;
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    const ox = sx - CENTER_X;
    const oy = sy - HORIZON_Y;
    sx = CENTER_X + ox * cosR - oy * sinR;
    sy = HORIZON_Y + ox * sinR + oy * cosR;
    return { x: sx, y: sy, scale, dist: fwd };
  }

  function drawSky(state, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 40);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.55, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, HORIZON_Y + 40);
    // Sun, fixed to the late-afternoon west.
    const sun = project(cam.x - 900, cam.y + 260, cam.z + 1300, cam);
    if (sun) {
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 243, 196, 0.25)';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 46, 0, Math.PI * 2);
      ctx.fill();
    }
    // Two ridgelines, their phase sliding with the heading so turning feels real.
    for (let layer = 0; layer < 2; layer += 1) {
      const base = HORIZON_Y - 8 - layer * 26;
      const amp = 26 + layer * 22;
      const phase = cam.heading * (90 + layer * 60);
      ctx.fillStyle = layer === 0 ? PALETTE.ridgeFar : PALETTE.ridgeNear;
      ctx.beginPath();
      ctx.moveTo(0, HORIZON_Y + 40);
      for (let sx = 0; sx <= FIELD.width; sx += 16) {
        const y = base - amp * (0.5 + 0.5 * noise1(sx * 0.004 + phase + layer * 7.3));
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(FIELD.width, HORIZON_Y + 40);
      ctx.closePath();
      ctx.fill();
    }
    // Clouds: soft ellipses drifting slowly across the sky.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < 7; i += 1) {
      const cx = ((i * 211 + state.time * 6) % 1500) - 110;
      const cy = 52 + (i % 3) * 46 + 12 * Math.sin(i * 2.1);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 64, 15, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 34, cy + 6, 44, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGround(state, cam, terrainHeight) {
    // Depth rows from far to near so near quads paint over far ones.
    const depths = [];
    for (let i = 0; i < ROWS; i += 1) {
      const t = i / (ROWS - 1);
      depths.push(8 + (FAR - 8) * t * t);
    }
    for (let ri = ROWS - 1; ri >= 0; ri -= 1) {
      const zNear = cam.z + depths[ri];
      const zFar = cam.z + (ri + 1 < ROWS ? depths[ri + 1] : FAR + 120);
      for (let ci = 0; ci < COLUMNS; ci += 1) {
        const x0 = -GROUND_HALF + (ci * 2 * GROUND_HALF) / COLUMNS;
        const x1 = -GROUND_HALF + ((ci + 1) * 2 * GROUND_HALF) / COLUMNS;
        const xm = (x0 + x1) / 2;
        const zm = (zNear + zFar) / 2;
        const h = terrainHeight(xm, zm);
        const p00 = project(x0, terrainHeight(x0, zNear), zNear, cam);
        const p10 = project(x1, terrainHeight(x1, zNear), zNear, cam);
        const p11 = project(x1, terrainHeight(x1, zFar), zFar, cam);
        const p01 = project(x0, terrainHeight(x0, zFar), zFar, cam);
        if (!p00 || !p10 || !p11 || !p01) continue;
        ctx.fillStyle = groundColor(xm, zm, h);
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRings(state, cam) {
    for (const ring of state.rings) {
      if (ring.passed || ring.z < cam.z - 30 || ring.z > cam.z + FAR) continue;
      const c = project(ring.x, ring.y, ring.z, cam);
      if (!c) continue;
      const r = ring.r * c.scale;
      if (r < 2) continue;
      ctx.strokeStyle = PALETTE.ringGlow;
      ctx.lineWidth = Math.max(3, r * 0.28);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.ring;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // Chevrons on the ring face point the way in.
      ctx.fillStyle = PALETTE.ring;
      ctx.font = `bold ${Math.max(10, r * 0.5)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('›', c.x, c.y);
    }
  }

  function drawBalloons(state, cam) {
    for (const b of state.balloons) {
      if (b.z < cam.z - 20 || b.z > cam.z + FAR) continue;
      const bob = Math.sin(state.time * 0.7 + b.bob) * 2;
      const c = project(b.x, b.y + bob, b.z, cam);
      if (!c) continue;
      const r = b.r * c.scale;
      if (r < 1.5) continue;
      ctx.fillStyle = b.hue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(c.x - r * 0.3, c.y - r * 0.35, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.balloonBasket;
      ctx.fillRect(c.x - r * 0.22, c.y + r * 0.95, r * 0.44, r * 0.4);
    }
  }

  /** The plane, drawn as a chase-view silhouette banking with the roll. */
  function drawPlane(state) {
    const cx = CENTER_X;
    const cy = 468;
    const bank = state.roll;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bank * 0.5);
    const s = 1 + state.speed / 900;
    ctx.scale(s, s);
    // Propeller blur.
    ctx.fillStyle = 'rgba(232, 238, 244, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -6, 15, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings.
    ctx.fillStyle = PALETTE.plane;
    ctx.beginPath();
    ctx.moveTo(-118, 6);
    ctx.lineTo(-30, -8);
    ctx.lineTo(30, -8);
    ctx.lineTo(118, 6);
    ctx.lineTo(104, 16);
    ctx.lineTo(-104, 16);
    ctx.closePath();
    ctx.fill();
    // Fuselage.
    ctx.fillStyle = PALETTE.plane;
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.quadraticCurveTo(15, -30, 14, 6);
    ctx.quadraticCurveTo(13, 34, 0, 44);
    ctx.quadraticCurveTo(-13, 34, -14, 6);
    ctx.quadraticCurveTo(-15, -30, 0, -52);
    ctx.fill();
    // Red cheatline + tail.
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-13, -2, 26, 7);
    ctx.beginPath();
    ctx.moveTo(-34, 34);
    ctx.lineTo(0, 22);
    ctx.lineTo(34, 34);
    ctx.lineTo(28, 42);
    ctx.lineTo(-28, 42);
    ctx.closePath();
    ctx.fill();
    // Cockpit glass.
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(0, -26, 8, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wingtip nav lights.
    ctx.fillStyle = '#ff5a4e';
    ctx.beginPath();
    ctx.arc(-116, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7ee787';
    ctx.beginPath();
    ctx.arc(116, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function bar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = PALETTE.gauge;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * clamp(frac, 0, 1)), h - 4);
    if (label) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 6, y + h / 2);
    }
  }

  function drawHud(state, screen) {
    const knots = Math.round(state.speed * 1.944);
    const altM = Math.max(0, Math.round(state.y - state.ground));
    const altFt = Math.round((state.y - state.ground) * 3.28084);
    const compass = compassLabel(state.heading);
    const timeLeft = Math.max(0, RUN_SECONDS - state.time);

    // Top compass tape.
    ctx.fillStyle = 'rgba(13, 20, 32, 0.72)';
    ctx.fillRect(CENTER_X - 190, 12, 380, 34);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${compass.point}  ${compass.deg}°`, CENTER_X, 29);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText('HDG', CENTER_X, 12 + 34 - 8);

    // Left: airspeed. Right: altitude (AGL).
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(13, 20, 32, 0.72)';
    ctx.fillRect(16, 60, 132, 64);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(`${knots}`, 28, 88);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('KNOTS', 28, 110);
    ctx.fillStyle = 'rgba(13, 20, 32, 0.72)';
    ctx.fillRect(FIELD.width - 148, 60, 132, 64);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(`${altM}`, FIELD.width - 28, 88);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`m AGL  ·  ${altFt} ft`, FIELD.width - 28, 110);

    // Next-ring guidance.
    const ring = state.rings[state.nextRing];
    if (ring && screen === SCREEN_PLAY) {
      const dx = ring.x - state.x;
      const dz = Math.max(1, ring.z - state.z);
      const bearing = Math.atan2(dx, dz) - state.heading;
      const arrow = bearing > 0.25 ? '››' : bearing < -0.25 ? '‹‹' : '◎';
      ctx.fillStyle = 'rgba(13, 20, 32, 0.72)';
      ctx.fillRect(CENTER_X - 110, 56, 220, 30);
      ctx.fillStyle = PALETTE.ring;
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${state.nextRing + 1}/${RINGS.count}  ${arrow}  ${Math.round(dz)} m`, CENTER_X, 71);
    }

    // Bottom instrument panel.
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, FIELD.height - 104, FIELD.width, 104);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, FIELD.height - 104, FIELD.width, 2);

    // Artificial horizon.
    const hx = 96;
    const hy = FIELD.height - 52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 34, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(hx - 34, hy - 34, 68, 34 + state.pitch * 40);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(hx - 34, hy + state.pitch * 40, 68, 34 - state.pitch * 40 + 34);
    ctx.rotate(-state.roll * 0.5);
    ctx.fillStyle = '#eef1f5';
    ctx.fillRect(hx - 34, hy - 1, 68, 2);
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', hx, hy + 48);

    // Throttle + score + timer + rings, left to right.
    bar(170, FIELD.height - 78, 150, 18, state.throttle, '#f2a541', 'THR');
    bar(170, FIELD.height - 50, 150, 18, state.speed / 105, '#4f9de0', 'SPD');
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${state.score}`, 350, FIELD.height - 62);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = state.combo >= 2 ? PALETTE.ring : PALETTE.muted;
    ctx.fillText(state.combo >= 2 ? `COMBO x${(1 + Math.min(state.combo - 1, 4) * 0.5).toFixed(1)}` : 'NO COMBO', 350, FIELD.height - 36);
    ctx.textAlign = 'center';
    ctx.fillStyle = timeLeft < 20 ? PALETTE.warn : PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    const mm = Math.floor(timeLeft / 60);
    const ss = Math.floor(timeLeft % 60).toString().padStart(2, '0');
    ctx.fillText(`${mm}:${ss}`, FIELD.width - 300, FIELD.height - 62);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('TIME LEFT', FIELD.width - 300, FIELD.height - 36);
    ctx.fillStyle = PALETTE.ring;
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`◉ ${state.ringsHit}/${RINGS.count}`, FIELD.width - 130, FIELD.height - 62);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('RINGS', FIELD.width - 130, FIELD.height - 36);

    // Wind gust warning.
    if (state.gustTimeLeft > 0) {
      ctx.fillStyle = PALETTE.warn;
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(state.gust > 0 ? 'WIND GUST →' : '← WIND GUST', CENTER_X, FIELD.height - 118);
    }
    // Low-altitude warning.
    if (state.y - state.ground < 12 && screen === SCREEN_PLAY) {
      ctx.fillStyle = PALETTE.warn;
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('⚠ PULL UP', CENTER_X, 150);
    }
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(8, 13, 24, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = `bold 54px ${FONT}`;
    ctx.fillText(title, CENTER_X, 218);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, CENTER_X, 268 + i * 30));
  }

  function draw(state, screen, best, terrainHeight) {
    setup();
    const cam = {
      x: state.x - Math.sin(state.heading) * CAMERA.behind,
      z: state.z - Math.cos(state.heading) * CAMERA.behind,
      y: state.y + CAMERA.above,
      heading: state.heading,
      pitch: state.pitch,
      roll: state.roll,
    };
    if (screen === SCREEN_TITLE) {
      // Parked on the runway: camera low, looking down the strip.
      cam.x = 0;
      cam.z = -30;
      cam.y = 5;
      cam.heading = 0;
      cam.pitch = 0.02;
      cam.roll = 0;
    }
    drawSky(state, cam);
    drawGround(state, cam, terrainHeight);
    drawRings(state, cam);
    drawBalloons(state, cam);
    drawPlane(state);
    if (screen !== SCREEN_TITLE) drawHud(state, screen);

    if (screen === SCREEN_TITLE) {
      overlay('MERAPI VALLEY RUN', [
        'Fly the valley. Thread all 22 rings. Mind the balloons and the mountains.',
        '↑ ↓ pitch   ← → turn   SHIFT / CTRL throttle   mouse steers   M mute   P pause',
        'Press SPACE or click to take off',
        best > 0 ? `Best score: ${best}` : 'First flight — good luck, pilot',
      ]);
      // Title badge with the game name, drawn under the text block.
      ctx.fillStyle = PALETTE.ring;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('A 150-SECOND FLIGHT · 22 RINGS · ONE VALLEY', CENTER_X, 402);
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P or SPACE to keep flying']);
    } else if (screen === SCREEN_OVER) {
      const title = state.landed ? 'TOUCHDOWN!' : state.crashed ? 'CRASHED' : 'RUN COMPLETE';
      const medal = MEDALS.find((m) => state.ringsHit >= m.rings);
      const medalLine = medal ? `Medal earned: ${medal.name}` : 'No medal this time — 5 rings earns Valley Flier.';
      const lines = state.crashed
        ? [
            state.crashReason === 'balloon'
              ? 'You clipped a hot-air balloon.'
              : state.crashReason === 'mountain'
                ? 'The mountain won this round.'
                : 'You flew into the ground.',
            `Rings: ${state.ringsHit}/${RINGS.count}   Best combo: x${state.bestCombo}`,
            `Score: ${state.score}   Best: ${Math.max(best, state.score)}`,
            medalLine,
            'Press SPACE or click to fly again',
          ]
        : [
            state.landed
              ? 'A gentle landing on the runway — +250 bonus.'
              : `Time up after ${RUN_SECONDS} seconds over the valley.`,
            `Rings: ${state.ringsHit}/${RINGS.count}   Missed: ${state.ringsMissed}   Best combo: x${state.bestCombo}`,
            `Score: ${state.score}   Best: ${Math.max(best, state.score)}`,
            medalLine,
            'Press SPACE or click to fly again',
          ];
      overlay(title, lines, state.crashed ? PALETTE.warn : PALETTE.good);
    }
  }

  return { draw };
}
