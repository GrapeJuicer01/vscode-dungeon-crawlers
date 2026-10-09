// Animation timings (docs/architecture/data-model.md section 5). Per-frame durations in
// milliseconds; every animation loops. Names match docs/design/sprite-spec.md.

/** Hero animation name -> per-frame durations in ms. */
export const HERO_FRAME_MS: Readonly<Record<string, readonly number[]>> = {
  idle: [500],
  walk: [130],
  attack: [140, 90, 160],
  ability: [120, 140, 200],
  sit: [600],
  eat: [600],
  sleep: [600],
  polish: [600],
  read: [600],
  warmHands: [600],
  victory: [300],
};

/** Length of one `ability` animation, in ms. */
export const ABILITY_TOTAL_MS: number = (HERO_FRAME_MS['ability'] ?? []).reduce((a, b) => a + b, 0);

export const FLAME_FRAME_MS = 110;
export const TORCH_FRAME_MS = 130;
/** Other looping props (a puddle ripple). Assumption: slow, so it stays calm. */
export const PROP_FRAME_MS = 500;

/**
 * Summon animation name -> per-frame durations in ms (H2, docs/architecture/plans/h2-classes.md
 * section 3.5). `idle`, `walk`, and `attack` loop; `rise` and `sink` play once (onceFrameIndex).
 */
export const SUMMON_FRAME_MS: Readonly<Record<string, readonly number[]>> = {
  idle: [400],
  walk: [130],
  attack: [140, 90, 160],
  rise: [110],
  sink: [100],
};

/** Frames of the once-only summon animations (the validator requires exactly these). */
export const SUMMON_RISE_FRAMES = 4;
export const SUMMON_SINK_FRAMES = 3;
/** Total play time of `rise` and `sink`, in ms, computed from SUMMON_FRAME_MS. */
export const SUMMON_RISE_TOTAL_MS: number =
  (SUMMON_FRAME_MS['rise']?.[0] ?? 110) * SUMMON_RISE_FRAMES;
export const SUMMON_SINK_TOTAL_MS: number =
  (SUMMON_FRAME_MS['sink']?.[0] ?? 100) * SUMMON_SINK_FRAMES;

const FALLBACK_FRAME_MS: readonly number[] = [500];

/** Frame index for `elapsedMs` into the named hero animation. Allocation-free. */
export function heroFrameIndex(name: string, elapsedMs: number, frameCount: number): number {
  return tableFrameIndex(HERO_FRAME_MS, name, elapsedMs, frameCount);
}

/** Looping frame index of a summon animation (`idle`, `walk`, `attack`). Allocation-free. */
export function summonFrameIndex(name: string, elapsedMs: number, frameCount: number): number {
  return tableFrameIndex(SUMMON_FRAME_MS, name, elapsedMs, frameCount);
}

/** Frame index of a once-only summon animation: clamps at the last frame. Allocation-free. */
export function onceFrameIndex(name: string, elapsedMs: number, frameCount: number): number {
  if (frameCount <= 1 || !(elapsedMs > 0)) {
    return 0;
  }
  const frameMs = SUMMON_FRAME_MS[name]?.[0] ?? FALLBACK_FRAME_MS[0] ?? 500;
  return Math.min(frameCount - 1, Math.floor(elapsedMs / frameMs));
}

function tableFrameIndex(
  table: Readonly<Record<string, readonly number[]>>,
  name: string,
  elapsedMs: number,
  frameCount: number,
): number {
  if (frameCount <= 1) {
    return 0;
  }
  const durations = table[name] ?? FALLBACK_FRAME_MS;
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
