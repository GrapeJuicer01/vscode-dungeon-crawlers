// Class assignment (decision H1-1): a pure function of the session id. No state, no storage, no
// transcript content, no tool names. Because it depends only on the id, a class survives webview
// reloads, replaced heroes, and snapshot rebuilds. Adding classes in H2/H3 changes the delivered
// count and so may reshuffle once when the extension updates (accepted, H1 plan section 9).
import { hashId } from '../rng';
import { CLASS_IDS } from './classes';
import type { ClassId } from './classes';

/** The classes that have art and behavior so far. H2: all eight, in CLASS_IDS order (H1 four first). */
export const DELIVERED_CLASSES: readonly ClassId[] = CLASS_IDS;

/** Bit offset of the class slice of the FNV-1a hash (see classFor). */
const CLASS_SHIFT = 20;

/**
 * Pure, total, never throws. Uses the high bits of the FNV-1a hash so the class is not tied to
 * the skin tone (h % 4) or the hair color ((h >>> 8) % 6).
 * H2 changed the slice from `>>> 16` to `>>> 20`: with eight classes the old slice gave only four
 * distinct classes for the simulator ids sim-0-0..sim-7-0 (needs >= 5 incl. an H2 class); `>>> 20`
 * gives seven, including Cleric, Paladin, and Necromancer. Because the modulus is a power of two
 * and the H1 classes keep indexes 0..3, at any one shift an id whose (h >>> shift) % 8 < 4 has the
 * same class under four and eight classes. The slice change itself reshuffles every id once
 * relative to H1 (H1 is unreleased, so no user sees it); skin x class and hair x class stay independent (all 32 and 48 pairs occur over 1,000 ids).
 */
export function classFor(id: string): ClassId {
  const index = (hashId(id) >>> CLASS_SHIFT) % DELIVERED_CLASSES.length;
  return DELIVERED_CLASSES[index] ?? 'warrior';
}
