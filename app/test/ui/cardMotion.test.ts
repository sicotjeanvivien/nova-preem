import { describe, expect, it } from "vitest";
import { aim, drag, flipTarget, IDLE_DELAY, initialMotion, lighting, recenterTarget, step, type Motion } from "../../src/ui/cardMotion.ts";

const FRAME = 1000 / 60;

/** Runs frames until the card stops moving (or `limit` frames). */
function settle(motion: Motion, start: number, autoSpin = false, limit = 600) {
  let now = start;
  for (let i = 0; i < limit; i++) {
    now += FRAME;
    const next = step(motion, FRAME, now, autoSpin);
    if (next === motion) return { motion, now };
    motion = next;
  }
  return { motion, now };
}

describe("3D view motion (§5.10)", () => {
  it("turns the card with a drag, then slows it down by inertia until it stops", () => {
    const dragged = drag(initialMotion(0), 20, 0, 0);
    expect(dragged.pose).toEqual({ rx: -8, ry: -13 });
    const { motion } = settle(dragged, 0);
    expect(motion.pose.ry).toBeGreaterThan(-13);
    expect(motion.velocity.x).toBeLessThan(0.05);
  });

  it("flips to the back and recenters on the front, facing the viewer", () => {
    expect(flipTarget({ rx: -8, ry: -22 })).toEqual({ rx: 0, ry: 180 });
    expect(flipTarget({ rx: 0, ry: 180 })).toEqual({ rx: 0, ry: 360 });
    expect(recenterTarget({ rx: 12, ry: 200 })).toEqual({ rx: 0, ry: 360 });
    const { motion } = settle(aim(initialMotion(0), { rx: 0, ry: 180 }), 0);
    expect(motion.pose).toEqual({ rx: 0, ry: 180 });
    expect(motion.target).toBeNull();
  });

  it("turns by itself only after a rest, and never when animations are reduced", () => {
    const resting = initialMotion(0);
    expect(step(resting, FRAME, IDLE_DELAY - 1, true)).toBe(resting);
    expect(step(resting, FRAME, IDLE_DELAY + 1, false)).toBe(resting);
    expect(step(resting, FRAME, IDLE_DELAY + 1, true).pose.ry).toBeGreaterThan(resting.pose.ry);
  });

  it("moves the light with the tilt: centered and dim when the card faces the viewer", () => {
    expect(lighting({ rx: 0, ry: 0 })).toMatchObject({ foilX: 50, foilY: 50, foilOpacity: 0.25, glareOpacity: 0.35 });
    expect(lighting({ rx: 0, ry: 45 }).foilX).toBeGreaterThan(80);
  });
});
