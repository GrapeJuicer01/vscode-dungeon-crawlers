// Animation timings (docs/architecture/data-model.md section 5). Per-frame durations in
// milliseconds; every animation loops. Names match docs/design/sprite-spec.md.

/** Hero animation name -> per-frame durations in ms. */
export const HERO_FRAME_MS: Readonly<Record<string, readonly number[]>> = {
  idle: [500],
  walk: [130],
  attack: [140, 90, 160],
  sit: [600],
  eat: [600],
  sleep: [600],
  polish: [600],
  read: [600],
  warmHands: [600],
  victory: [300],
};

export const FLAME_FRAME_MS = 110;
export const TORCH_FRAME_MS = 130;
/** Other looping props (a puddle ripple). Assumption: slow, so it stays calm. */
export const PROP_FRAME_MS = 500;

const FALLBACK_FRAME_MS: readonly number[] = [500];

/** Frame index for `elapsedMs` into the named animation. Allocation-free. */
export function heroFrameIndex(name: string, elapsedMs: number, frameCount: number): number {
  if (frameCount <= 1) {
    return 0;
  }
  const durations = HERO_FRAME_MS[name] ?? FALLBACK_FRAME_MS;
  const cycle = durations.length === 1 ? (durations[0] ?? 500) * frameCount : sum(durations);
  let t = elapsedMs % cycle;
  if (!(t >= 0)) {
    t = 0;
  }
  if (durations.length === 1) {
    return Math.floor(t / (durations[0] ?? 500)) % frameCount;
  }
  for (let i = 0; i < frameCount; i++) {
    const d = durations[i] ?? durations[durations.length - 1] ?? 500;
    if (t < d) {
      return i;
    }
    t -= d;
  }
  return frameCount - 1;
}

/** Frame index of a uniform loop (flame, torch, ripple). */
export function loopFrameIndex(frameMs: number, elapsedMs: number, frameCount: number): number {
  if (frameCount <= 1 || !(elapsedMs >= 0)) {
    return 0;
  }
  return Math.floor(elapsedMs / frameMs) % frameCount;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}
