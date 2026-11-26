// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.
// Units: metres, seconds, radians. Speeds are m/s (knots on the HUD = m/s x 1.944).

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One run lasts this long; the clock decides the end, not the distance. */
export const RUN_SECONDS = 150;

export const PLANE = {
  /** Take-off / cruise start. */
  startAltitude: 55,
  startSpeed: 62,
  minSpeed: 30,
  maxSpeed: 105,
  /** m/s gained per second of throttle. */
  accel: 26,
  /** Climb rate factor: vertical speed = sin(pitch) * speed * this. */
  climbFactor: 0.85,
  /** How fast the nose follows the stick. */
  pitchRate: 1.6,
  maxPitch: 0.55,
  /** How fast the wings bank into a turn. */
  rollRate: 2.2,
  maxRoll: 1.0,
  /** Heading change per radian of bank, per second. */
  turnRate: 0.55,
  /** Below this speed the wing stops flying and the plane sinks. */
  stallSpeed: 38,
  /** Ground clearance that counts as a crash (the wheels are 2.5 m below the nose). */
  clearance: 2.5,
};

export const THROTTLE = { step: 0.55, start: 0.72 };

export const RINGS = {
  count: 22,
  firstZ: 520,
  spacing: 260,
  radius: 20,
  points: 100,
};

export const BALLOONS = { count: 14, minZ: 900, maxZ: 5800, radius: 9 };

/** Valley shape: the walls rise past this lateral distance. */
export const VALLEY = { halfWidth: 150, wallStart: 170, wallTop: 430, wallHeight: 165 };

export const GUSTS = { everySeconds: 7, duration: 2.2, maxPush: 9 };

/** Runway the title screen stages the plane on (also the landing strip). */
export const RUNWAY = { z0: -60, z1: 420, halfWidth: 13 };

/** The chase camera: focal length in logical pixels (about a 55-degree vertical field of
 * view), the horizon line, and how far ahead the ground is drawn. */
export const CAMERA = {
  focal: 430,
  horizonY: 296,
  far: 1500,
  rows: 26,
  columns: 15,
  groundHalf: 440,
  /** How far behind and above the plane the camera sits. */
  behind: 16,
  above: 7,
};

/** End-of-run medals by rings threaded (shown on the game-over screen). */
export const MEDALS = [
  { rings: 20, name: 'GOLD WINGS' },
  { rings: 15, name: 'SILVER WINGS' },
  { rings: 10, name: 'BRONZE WINGS' },
  { rings: 5, name: 'VALLEY FLIER' },
];

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7db6e8',
  skyLow: '#cfe8f7',
  sun: '#fff3c4',
  ridgeFar: '#8fa8c8',
  ridgeNear: '#5f7ba0',
  fieldA: '#6da24f',
  fieldB: '#8aa653',
  fieldC: '#b5a05e',
  fieldD: '#4f8a4a',
  forest: '#2f6b34',
  river: '#3f8fd2',
  rock: '#8d8578',
  snow: '#eef3f6',
  runway: '#3a3f46',
  runwayMark: '#f4f6f8',
  ring: '#ffd23f',
  ringGlow: 'rgba(255, 210, 63, 0.35)',
  balloon: '#e5534b',
  balloonBasket: '#7a4a21',
  plane: '#e8eef4',
  planeTrim: '#d8443c',
  panel: '#171d29',
  panelEdge: '#2c3648',
  gauge: '#0d1420',
  text: '#eef1f5',
  muted: '#9aa7b8',
  warn: '#ff5a4e',
  good: '#7ee787',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'merapi-valley-run.best';
