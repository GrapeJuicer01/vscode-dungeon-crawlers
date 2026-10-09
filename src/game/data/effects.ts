// Cosmetic effect ids (H1 to H3). An effect is a small sprite that flies or blooms and fades; it never
// targets a hero and carries no gameplay number. Art lives in sprites/effectTemplates.ts, which
// cannot import data, so the ids are repeated there and the validator checks the keys.
export const EFFECT_IDS = [
  'whirl',
  'orbBolt',
  'arcaneBurst',
  'arrow',
  'dagger',
  'smokePuff',
  // H2 (appended; the six H1 ids and their order never change)
  'buffSparkle',
  'note',
  'blessGlow',
  'holyBurst',
  'soulWisp',
  // H3 (appended; the eleven H1/H2 ids and their order never change)
  'leaf',
  'chiOrb',
  'chiBurst',
  'warCry',
  'wrench',
] as const;

export type EffectId = (typeof EFFECT_IDS)[number];
