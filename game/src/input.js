// Keyboard + mouse input. Arrows / WASD fly the plane, Shift / Ctrl work the throttle,
// the mouse steers toward the pointer when it moves, Space or click confirms, P pauses.
// Every frame the game asks for the current stick position and drains one-shot actions.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const KEY_PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const KEY_PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const KEY_TURN_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEY_TURN_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEY_THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight']);
const KEY_THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight']);
const KEY_CONFIRM = new Set(['Space', 'Enter']);
const KEY_PAUSE = new Set(['KeyP', 'Escape']);
const KEY_MUTE = new Set(['KeyM']);

function anyPressed(keys, set) {
  for (const code of set) if (keys.has(code)) return true;
  return false;
}

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  /** Pointer offset from screen centre, -1..1, or null while the mouse is idle. */
  let mouse = null;
  let mouseIdleTimer = 0;

  function onKeyDown(event) {
    if (KEY_CONFIRM.has(event.code)) {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (KEY_PAUSE.has(event.code)) {
      actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (KEY_MUTE.has(event.code)) {
      actions |= ACTION_MUTE;
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
    keys.add(event.code);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouse = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    mouseIdleTimer = 2.5;
  }

  function onPointerDown(event) {
    onPointerMove(event);
    actions |= ACTION_CONFIRM;
    event.preventDefault();
  }

  function onBlur() {
    keys.clear();
    mouse = null;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('blur', onBlur);

  /** The stick this frame: keyboard axes, overridden by the mouse while it steers. */
  function control(dt) {
    if (mouseIdleTimer > 0) mouseIdleTimer -= dt;
    else mouse = null;
    let pitch = 0;
    let turn = 0;
    if (anyPressed(keys, KEY_PITCH_UP)) pitch += 1;
    if (anyPressed(keys, KEY_PITCH_DOWN)) pitch -= 1;
    if (anyPressed(keys, KEY_TURN_LEFT)) turn -= 1;
    if (anyPressed(keys, KEY_TURN_RIGHT)) turn += 1;
    return {
      pitch,
      turn,
      throttleUp: anyPressed(keys, KEY_THROTTLE_UP),
      throttleDown: anyPressed(keys, KEY_THROTTLE_DOWN),
      mouse,
    };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { control, takeActions };
}

/** The same stick shape the screenshot autopilot feeds the world (no DOM needed). */
export function neutralControl() {
  return { pitch: 0, turn: 0, throttleUp: false, throttleDown: false, mouse: null };
}

export { FIELD };
