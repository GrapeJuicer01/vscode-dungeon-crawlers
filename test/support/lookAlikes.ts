// Look-alike policy (E3 plan section 7, note 4), shared by test/game/lookAlikes.test.ts and the
// artist feedback command (test/support/lookAlikesReport.mjs). Pure functions over template maps, so
// they run against shipped art and against template maps that are not wired in yet.
//
// Metrics use opaque pixels of idle frame 0 as anchor-relative keys:
//   overlap = shared / smaller pixel count,   iou = shared / union.
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';

/** Overlap must stay under this for any same-size pair (unless pinned). */
export const OVERLAP_LIMIT = 0.85;
/** IoU may not exceed this for any same-size pair (unless pinned). */
export const IOU_LIMIT = 0.8;
/** Two minions of one stage must stay under this overlap (stage palettes leave only shape to separate them). */
export const SAME_STAGE_LIMIT = 0.75;
/** Float noise allowance when comparing against a pinned three-decimal value. */
export const PIN_TOLERANCE = 0.0005;

export interface PinnedPair {
  /** Overlap over the smaller count, as measured when pinned. */
  readonly overlap: number;
  /** IoU, as measured when the IoU ratchet was added. */
  readonly iou: number;
}

/**
 * The ten E2 pairs that exceeded the policy (green-slime, toxic-toad, spore-shroom, and
 * wailing-ghost against older enemies). The artist's in-place rework (plan A-E3-0) cleared all ten,
 * so every entry was removed (a pin that no longer exceeds is stale and fails). Kept as an empty
 * record so the ratchet machinery and its tests stay; no entry may be added for any new pair.
 */
export const KNOWN_OVER: Readonly<Record<string, PinnedPair>> = {};

/** The 20 enemies wired when the generalized policy was written (E1 and E2). Only pairs among them may be pinned. */
export const BASELINE_IDS: readonly string[] = [
  'cellar-rat',
  'cave-bat',
  'web-spider',
  'crate-mimic',
  'rat-king',
  'goblin-miner',
  'goblin-scout',
  'ore-beetle',
  'rock-golem',
  'goblin-foreman',
  'green-slime',
  'spore-shroom',
  'toxic-toad',
  'jelly-cube',
  'ooze-queen',
  'bone-soldier',
  'wailing-ghost',
  'tomb-scarab',
  'crypt-mummy',
  'tomb-lich',
];

/**
 * LEGACY DEBT ratchet, now empty. Generalizing the policy (all tiers, IoU, same-stage) surfaced 18
 * pairs among the 20 E1/E2 enemies that exceeded it; the A-E3-0 rework cleared 7 and the later
 * pixel-artist rework of seven templates cleared the last 11, so every pin was removed (a pin that
 * no longer exceeds is stale and fails). Kept as an empty record so the ratchet machinery and its
 * tests stay for future use. No pair involving a post-baseline enemy may ever be added here.
 */
export const LEGACY_OVER: Readonly<Record<string, PinnedPair>> = {};

/** Every pin the evaluator applies by default. */
export const ALL_PINS: Readonly<Record<string, PinnedPair>> = { ...KNOWN_OVER, ...LEGACY_OVER };

export interface LookAlikeEntry {
  readonly id: string;
  /** 1-based stage, or 0 when unknown (skips the same-stage rule). */
  readonly stage: number;
  readonly template: SpriteTemplate;
}

export interface PairMetrics {
  readonly a: string;
  readonly b: string;
  readonly stageA: number;
  readonly stageB: number;
  readonly overlap: number;
  readonly iou: number;
  readonly sameStage: boolean;
}

/** Opaque idle-frame-0 pixels as anchor-relative keys, so differently sized frames still align. */
export function opaquePixels(t: SpriteTemplate): Set<string> {
  const out = new Set<string>();
  t.animations['idle']![0]!.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      if (ch !== '.') out.add(`${x - t.anchor.x},${y - t.anchor.y}`);
    });
  });
  return out;
}

/** Shared pixels, smaller count, and union of two templates aligned at their anchors. */
function counts(
  a: SpriteTemplate,
  b: SpriteTemplate,
): { shared: number; min: number; union: number } {
  const pa = opaquePixels(a);
  const pb = opaquePixels(b);
  let shared = 0;
  for (const k of pa) if (pb.has(k)) shared += 1;
  return { shared, min: Math.min(pa.size, pb.size), union: pa.size + pb.size - shared };
}

/** Shared opaque pixels divided by the smaller pixel count. */
export function overlap(a: SpriteTemplate, b: SpriteTemplate): number {
  const c = counts(a, b);
  return c.min === 0 ? 0 : c.shared / c.min;
}

/** Shared opaque pixels divided by the union. */
export function iou(a: SpriteTemplate, b: SpriteTemplate): number {
  const c = counts(a, b);
  return c.union === 0 ? 0 : c.shared / c.union;
}

/** Metrics for one pair. */
export function measure(a: LookAlikeEntry, b: LookAlikeEntry): PairMetrics {
  return {
    a: a.id,
    b: b.id,
    stageA: a.stage,
    stageB: b.stage,
    overlap: overlap(a.template, b.template),
    iou: iou(a.template, b.template),
    sameStage: a.stage > 0 && a.stage === b.stage,
  };
}

/** Every pair of entries whose sprite size is identical (minion 16x16, elite 24x24, boss 48x48). */
export function sameSizePairs(entries: readonly LookAlikeEntry[]): PairMetrics[] {
  const out: PairMetrics[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (a.template.w !== b.template.w || a.template.h !== b.template.h) continue;
      out.push(measure(a, b));
    }
  }
  return out;
}

/** The pin for a pair, whichever order the key was written in. */
export function findPin(
  pins: Readonly<Record<string, PinnedPair>>,
  a: string,
  b: string,
): { key: string; pin: PinnedPair } | undefined {
  for (const key of [`${a} vs ${b}`, `${b} vs ${a}`]) {
    if (Object.hasOwn(pins, key)) return { key, pin: pins[key]! };
  }
  return undefined;
}

export interface Evaluation {
  /** Human-readable failures; empty when the policy holds. */
  readonly violations: string[];
  /** Pinned keys that were measured. */
  readonly seenPins: string[];
  /** Pinned keys measured but no longer exceeding the limits (remove them). */
  readonly stalePins: string[];
}

const f = (n: number): string => n.toFixed(3);

/**
 * Applies the policy to measured same-size pairs. Pinned pairs may not worsen on either metric;
 * unpinned pairs need overlap < 0.85 and IoU <= 0.80; same-stage minions need overlap < 0.75
 * (`minionIds` limits that rule to minions; pinned pairs are exempt from it, their ratchet applies).
 */
export function evaluate(
  pairs: readonly PairMetrics[],
  minionIds: ReadonlySet<string>,
  pins: Readonly<Record<string, PinnedPair>> = ALL_PINS,
): Evaluation {
  const violations: string[] = [];
  const seenPins: string[] = [];
  const stalePins: string[] = [];
  for (const p of pairs) {
    const label = `${p.a} vs ${p.b}`;
    const found = findPin(pins, p.a, p.b);
    if (found !== undefined) {
      seenPins.push(found.key);
      if (p.overlap > found.pin.overlap + PIN_TOLERANCE) {
        violations.push(
          `${label}: overlap ${f(p.overlap)} worsened from pinned ${found.pin.overlap}`,
        );
      }
      if (p.iou > found.pin.iou + PIN_TOLERANCE) {
        violations.push(`${label}: IoU ${f(p.iou)} worsened from pinned ${found.pin.iou}`);
      }
      const sameStageOver =
        p.sameStage && minionIds.has(p.a) && minionIds.has(p.b) && p.overlap >= SAME_STAGE_LIMIT;
      if (p.overlap < OVERLAP_LIMIT && p.iou <= IOU_LIMIT && !sameStageOver)
        stalePins.push(found.key);
      continue;
    }
    if (p.overlap >= OVERLAP_LIMIT) {
      violations.push(`${label}: overlap ${f(p.overlap)} (limit under ${OVERLAP_LIMIT})`);
    }
    if (p.iou > IOU_LIMIT)
      violations.push(`${label}: IoU ${f(p.iou)} (limit at most ${IOU_LIMIT})`);
    if (p.sameStage && minionIds.has(p.a) && minionIds.has(p.b) && p.overlap >= SAME_STAGE_LIMIT) {
      violations.push(
        `${label}: same-stage minions (stage ${p.stageA}) overlap ${f(p.overlap)} (limit under ${SAME_STAGE_LIMIT})`,
      );
    }
  }
  return { violations, seenPins, stalePins };
}

/** A printable matrix: the worst pairs first, flagged where they break the policy. */
export function formatReport(
  pairs: readonly PairMetrics[],
  minionIds: ReadonlySet<string>,
  top = 25,
): string {
  const ev = evaluate(pairs, minionIds);
  const bad = new Set(ev.violations.map((v) => v.split(':')[0]));
  const rows = [...pairs].sort((x, y) => y.overlap - x.overlap).slice(0, top);
  const lines = rows.map((p) => {
    const label = `${p.a} vs ${p.b}`;
    const pin = findPin(ALL_PINS, p.a, p.b) !== undefined ? ' [pinned]' : '';
    const flag = bad.has(label) ? '  FAIL' : '';
    return `${f(p.overlap)} overlap  ${f(p.iou)} IoU  ${p.sameStage ? 'same-stage  ' : ''}${label}${pin}${flag}`;
  });
  const failures = ev.violations.length === 0 ? 'policy holds' : ev.violations.join('\n');
  const stale = ev.stalePins.length === 0 ? '' : `\nstale pins: ${ev.stalePins.join(', ')}`;
  return `${lines.join('\n')}\n--\n${failures}${stale}`;
}
