// Class assignment (decision H1-1): a pure function of the session id. No state, no storage, no
// transcript content, no tool names. Because it depends only on the id, a class survives webview
// reloads, replaced heroes, and snapshot rebuilds. Adding classes in H2/H3 changes the delivered
// count and so may reshuffle once when the extension updates (accepted, H1 plan section 9).
import { hashId } from '../rng';
import { CLASS_IDS } from './classes';
import type { ClassId } from './classes';

/** The classes that have art and behavior: all twelve (H3, final), in CLASS_IDS order (H1 four first). */
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
 * relative to H1 (H1 is unreleased, so no user sees it).
 * H3 (final, twelve classes) keeps `>>> 20`: 12 bits give a modulo bias of 0.02 percent. Measured
 * (seeded 1,000 UUID-like ids, seed 7): per class 72..100 (7.2..10.0 percent); sim-0-0..sim-7-0 give
 * necromancer, rogue, monk, mage, warrior, druid, cleric, artificer (8 distinct, three H3 classes,
 * two summoners); all 48 skin x class pairs over 1,000 ids and all 72 hair x class pairs over 2,000
 * ids occur; 314 of 1,000 ids keep their H2 class (x % 24 < 8). This is the last reshuffle.
 */
export function classFor(id: string): ClassId {
  const index = (hashId(id) >>> CLASS_SHIFT) % DELIVERED_CLASSES.length;
  return DELIVERED_CLASSES[index] ?? 'warrior';
}
