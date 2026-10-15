// Summon ids (H2, ADR 0011). A summon is a cosmetic ally drawn from one template `summons/<id>`
// (sprites/summonTemplates.ts, which cannot import data, so the id is repeated there and the
// validator checks the keys). It carries no gameplay number. H3 appended the Druid beast and the
// Artificer turret (the skeleton keeps index 0).
export const SUMMON_IDS = ['skeleton', 'beast', 'turret'] as const;

export type SummonId = (typeof SUMMON_IDS)[number];
