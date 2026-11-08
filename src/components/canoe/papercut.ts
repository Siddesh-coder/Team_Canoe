// Tunable constants for the papercut sea. Decorative only - no claim state here.
export const layerCount = 14;
export const waveAmplitude = 13; // px, front layer bob
export const rockAngle = 6; // degrees
export const entryDuration = 3000; // ms
export const SESSION_KEY = "canoe-papercut-entered";

export type Spot = { x: number; y: number; scale: number };
/** Resting spots as fractions of the scene: x = canoe centre, y = waterline. */
export const positions: Spot[] = [{ x: 0.7, y: 0.72, scale: 1 }];

/** Layer i (0 = back) - top edge as a fraction of scene height. */
export const layerTop = (i: number) => 0.12 + Math.pow(i / (layerCount - 1), 1.1) * 0.56;
/** Index of the first layer drawn in front of the canoe. */
export const frontFrom = layerCount - 3;

const clampN = (n: number) => Math.max(0, Math.min(1, n));
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Pattern tile per layer: keeps the pencil texture near its native 1:1 size and varies the repeat. */
export function patternTile(i: number) {
  const k = 0.4 + 0.6 * (i / (layerCount - 1)); // farther rows: finer strokes
  return { w: (400 + ((i * 97) % 140)) * k, h: (270 + ((i * 53) % 80)) * k, x: -i * 13, y: -i * 9 };
}

/** Hand-cut wavy top edge in a 1000×300 box, filled down to the bottom. */
export function crestPoints(i: number) {
  const rand = seeded(i * 97 + 13);
  const depth = i / (layerCount - 1);
  const amp = 3 + depth * 24;
  const wl = 40 + depth * 80;
  const pts: string[] = [];
  for (let x = -20; x <= 1020; x += 10) {
    const y = 32 + Math.sin(x / wl + i * 1.7) * amp + Math.sin(x / (wl * 0.37) + i) * amp * 0.3 + (rand() - 0.5) * 1.6;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return pts;
}
export const wavePath = (i: number) => `M-20,300 L${crestPoints(i).join(" L")} L1020,300 Z`;
export const crestPath = (i: number) => `M${crestPoints(i).join(" L")}`;
/** 0 = sharp, 1 = fully in the fog; only the farthest rows haze. */
export const hazeOf = (i: number) => clampN((0.45 - i / (layerCount - 1)) / 0.45);

export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const easeOut = (n: number) => 1 - Math.pow(1 - clamp(n), 3);
export const easeOutBack = (n: number) => {
  const c = 1.4, x = clamp(n) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/** Canoe movement controller; the scene registers its tween target here. */
let current: Spot = { ...positions[0]! };
let tween: { from: Spot; to: Spot; start: number; dur: number } | null = null;
export function sailTo(to: Spot, duration = 1800) {
  tween = { from: { ...current }, to, start: performance.now(), dur: Math.max(1, duration) };
}
export function canoeSpot(now: number): Spot {
  if (tween) {
    const k = easeOut((now - tween.start) / tween.dur);
    const { from, to } = tween;
    current = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, scale: from.scale + (to.scale - from.scale) * k };
    if (k >= 1) tween = null;
  }
  return current;
}
