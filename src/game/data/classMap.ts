// Class assignment (decision H1-1): a pure function of the session id. No state, no storage, no
// transcript content, no tool names. Because it depends only on the id, a class survives webview
// reloads, replaced heroes, and snapshot rebuilds. Adding classes in H2/H3 changes the delivered
// count and so may reshuffle once when the extension updates (accepted, H1 plan section 9).
import { hashId } from '../rng';
import { CLASS_IDS } from './classes';
import type { ClassId } from './classes';

/** The classes that have art and behavior so far. H1: all four, in CLASS_IDS order. */
export const DELIVERED_CLASSES: readonly ClassId[] = CLASS_IDS;

/**
 * Pure, total, never throws. Uses the upper 16 bits of the FNV-1a hash so the class is not tied
 * to the skin tone (h % 4) or the hair color ((h >>> 8) % 6).
 */
export function classFor(id: string): ClassId {
  const index = (hashId(id) >>> 16) % DELIVERED_CLASSES.length;
  return DELIVERED_CLASSES[index] ?? 'warrior';
}
