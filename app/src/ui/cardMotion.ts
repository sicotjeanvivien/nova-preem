// Motion of the card in the 3D view (docs/app-spec.md §5.10), as pure functions
// so the animation loop only writes their result to CSS variables.

/** Rotation of the card, in degrees: rx tilts it up and down, ry turns it left and right. */
export interface Pose {
  rx: number;
  ry: number;
}

export interface Motion {
  pose: Pose;
  /** Inertia after a drag, in degrees per frame (60 fps). */
  velocity: { x: number; y: number };
  /** Pose the card eases to (flip, recenter, arrow keys), or null. */
  target: Pose | null;
  /** Last time (ms) the card was moved by the user or reached its target. */
  restingSince: number;
}

const FRAME = 1000 / 60;
const EASE = 0.14;
const FRICTION = 0.95;
const DRAG_SPEED = 0.45;
const SPIN = 0.12;
/** Delay before the card turns by itself. */
export const IDLE_DELAY = 3500;
export const KEY_STEP = 15;

export function initialMotion(now: number): Motion {
  return { pose: { rx: -8, ry: -22 }, velocity: { x: 0, y: 0 }, target: null, restingSince: now };
}

/** A drag of (dx, dy) pixels: turns the card and sets its inertia. */
export function drag(motion: Motion, dx: number, dy: number, now: number): Motion {
  return {
    pose: { rx: motion.pose.rx - dy * DRAG_SPEED, ry: motion.pose.ry + dx * DRAG_SPEED },
    velocity: { x: dx * DRAG_SPEED, y: dy * DRAG_SPEED },
    target: null,
    restingSince: now,
  };
}

export function aim(motion: Motion, target: Pose): Motion {
  return { ...motion, velocity: { x: 0, y: 0 }, target };
}

/** The other side, facing the viewer. */
export const flipTarget = ({ ry }: Pose): Pose => ({ rx: 0, ry: Math.round(ry / 180) * 180 + 180 });
/** The front, facing the viewer. */
export const recenterTarget = ({ ry }: Pose): Pose => ({ rx: 0, ry: Math.round(ry / 360) * 360 });

/** One frame, `elapsed` ms after the previous one. Returns the same object when nothing moves. */
export function step(motion: Motion, elapsed: number, now: number, autoSpin: boolean): Motion {
  const frames = Math.min(elapsed, 100) / FRAME;
  const { pose, velocity, target } = motion;
  if (target) {
    const keep = (1 - EASE) ** frames;
    const next = { rx: target.rx + (pose.rx - target.rx) * keep, ry: target.ry + (pose.ry - target.ry) * keep };
    if (Math.abs(target.rx - next.rx) < 0.15 && Math.abs(target.ry - next.ry) < 0.15)
      return { ...motion, pose: target, target: null, restingSince: now };
    return { ...motion, pose: next };
  }
  if (Math.abs(velocity.x) > 0.02 || Math.abs(velocity.y) > 0.02) {
    const keep = FRICTION ** frames;
    return {
      ...motion,
      pose: { rx: pose.rx - velocity.y * frames, ry: pose.ry + velocity.x * frames },
      velocity: { x: velocity.x * keep, y: velocity.y * keep },
      restingSince: now,
    };
  }
  if (autoSpin && now - motion.restingSince > IDLE_DELAY) return { ...motion, pose: { ...pose, ry: pose.ry + SPIN * frames } };
  return motion;
}

/** Position (%) and strength of the foil and glare layers, following the tilt of the card. */
export function lighting({ rx, ry }: Pose) {
  const sa = Math.sin((ry * Math.PI) / 180);
  const sb = Math.sin((rx * Math.PI) / 180);
  const tilt = Math.min(1, Math.abs(sa) + Math.abs(sb));
  return {
    foilX: 50 + 50 * sa,
    foilY: 50 - 50 * sb,
    foilOpacity: 0.25 + 0.6 * tilt,
    glareX: 50 - 60 * sa,
    glareY: 50 + 60 * sb,
    glareOpacity: 0.35 + 0.4 * tilt,
  };
}
