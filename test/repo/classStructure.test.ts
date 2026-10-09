// Structural checks for H1 (H1 plan test note 10; Core invariants 1 and 2): the class code carries
// no health, mana, death, retreat, damage, or gauge vocabulary and draws no rectangles; ClassHero
// cannot reach the roster or the lifecycle; classFor reads only the id; every phase switch knows
// `ability`. Comments are stripped before scanning.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listFiles } from '../support/repo';
import { blockAt, code, filesMatching, importSpecifiers } from '../support/source';

const gameFiles = listFiles('src/game').filter((f) => f.endsWith('.ts'));
const CLASS_FILES = [
  'src/game/entities/ClassHero.ts',
  'src/game/Effects.ts',
  'src/game/data/classes.ts',
  'src/game/data/classMap.ts',
  'src/game/data/effects.ts',
];
const SCANNED = [
  ...gameFiles.filter((f) => f.startsWith('src/game/entities/')),
  'src/game/Roster.ts',
  ...CLASS_FILES,
];

void describe('class code vocabulary (invariant 1)', () => {
  void it('scans the files that exist', () => {
    for (const f of CLASS_FILES) {
      assert.ok(gameFiles.includes(f), f);
    }
  });

  void it('no hp, health, mana, dead, downed, retreat, damage, or gauge in entities, Roster, Effects, or the class data', () => {
    const banned = /\b(hp|health|mana|dead|downed|retreat|damage|gauge)\b/i;
    const offenders = SCANNED.filter((f) => banned.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it('nor resource or cooldown words in ClassHero, Effects, or the class tables', () => {
    const banned =
      /\b(cooldown|stamina|energy|resource|armor|armour|crit|knockdown|wound|heal|revive|respawn)\b/i;
    for (const f of CLASS_FILES) {
      assert.doesNotMatch(code(f), banned, f);
    }
  });

  void it('the shipped class rows carry exactly the cosmetic keys and nothing numeric but shot geometry', () => {
    const src = code('src/game/data/classes.ts');
    // blockAt counts braces only and would stop after the first row, so slice the whole array.
    const start = src.indexOf('[', src.indexOf('export const CLASSES'));
    const rows = src.slice(start, src.indexOf('] as const', start));
    assert.ok(rows.includes("id: 'bard'"), 'the scan reaches the last row');
    const keys = new Set([...rows.matchAll(/\b([A-Za-z]+)\s*:/g)].map((m) => m[1]));
    assert.deepEqual(
      [...keys].sort(),
      [
        'ability',
        'colors',
        'dx',
        'dy',
        'effect',
        'id',
        'lifeMs',
        'name',
        'role',
        'shots',
        'silhouette',
        'kind',
        'strike',
        'summon',
        'vx',
        'vy',
      ].sort(),
    );
  });

  void it('the ClassDef, ClassAbility, and EffectShot interfaces have no field beyond the cosmetic ones', () => {
    const src = code('src/game/data/classes.ts');
    const fields = (name: string): string[] => {
      const open = src.indexOf('{', src.indexOf(`export interface ${name}`));
      return [...blockAt(src, open).matchAll(/readonly\s+(\w+)\s*:/g)]
        .map((m) => m[1] ?? '')
        .sort();
    };
    assert.deepEqual(fields('ClassDef'), [
      'ability',
      'colors',
      'id',
      'name',
      'role',
      'silhouette',
      'strike',
      'summon',
    ]);
    assert.deepEqual(fields('SummonDef'), ['dx', 'dy', 'kind']);
    assert.deepEqual(fields('ClassAbility'), ['id', 'name', 'shots']);
    assert.deepEqual(fields('EffectShot'), ['dx', 'dy', 'effect', 'lifeMs', 'vx', 'vy']);
  });

  void it('the Hero interface and subclasses declare no hp, health, mana, dead, downed, or retreat member', () => {
    const banned = /\b(hp|health|mana|dead|downed|retreat)\b/i;
    for (const f of ['src/game/entities/Hero.ts', 'src/game/entities/ClassHero.ts']) {
      assert.doesNotMatch(code(f), banned, f);
    }
  });
});

void describe('no gauge is drawn (invariant 1)', () => {
  void it('ClassHero.ts and Effects.ts call no fillRect, strokeRect, or text primitive', () => {
    for (const f of ['src/game/entities/ClassHero.ts', 'src/game/Effects.ts']) {
      assert.doesNotMatch(
        code(f),
        /\b(fillRect|strokeRect|fillText|strokeText|clearRect|arc|lineTo|setAlpha|setComposite)\s*\(/,
        f,
      );
    }
  });

  void it('Effects.ts draws with drawBitmap only', () => {
    const src = code('src/game/Effects.ts');
    assert.match(src, /\.drawBitmap\(/);
    assert.doesNotMatch(src, /\.drawBitmapRegion\(/);
  });

  void it('ClassHero.ts has no draw override at all (the look comes from heroLayers)', () => {
    const src = code('src/game/entities/ClassHero.ts');
    assert.doesNotMatch(src, /\bdraw\s*\(/);
    assert.match(src, /heroLayers\(/);
  });
});

void describe('ClassHero cannot reach the lifecycle (invariant 2)', () => {
  const src = code('src/game/entities/ClassHero.ts');

  void it('does not import Roster, Game, Engagement, or the protocol', () => {
    const specs = importSpecifiers(src);
    for (const s of specs) {
      assert.doesNotMatch(s, /Roster|Game|Engagement|protocol|webview|host|monitor/, s);
    }
    assert.doesNotMatch(src, /\bRoster\b/);
  });

  void it('never mentions applyAgentState, lifecycle, AgentInfo, or AgentState', () => {
    assert.doesNotMatch(
      src,
      /\b(applyAgentState|lifecycle|AgentInfo|AgentState|exiting|removable)\b/,
    );
  });

  void it('applyAgentState( is still defined only in Hero.ts and called only in Roster.ts', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bapplyAgentState\s*\(/).sort(), [
      'src/game/Roster.ts',
      'src/game/entities/Hero.ts',
    ]);
  });

  void it('lifecycle is assigned nowhere in src/game except Hero.ts', () => {
    const offenders = gameFiles
      .filter((f) => f !== 'src/game/entities/Hero.ts')
      .filter((f) => /\b#?lifecycle\s*=[^=]/.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it('no hook in Hero.ts or ClassHero.ts returns or accepts an AgentInfo', () => {
    for (const f of ['src/game/entities/Hero.ts', 'src/game/entities/ClassHero.ts']) {
      const lines = code(f)
        .split('\n')
        .filter((l) =>
          /\bprotected\b.*\b(onAttackStrike|shouldCastAbility|onAbilityRelease)\s*\(/.test(l),
        );
      assert.ok(lines.length >= 3, f);
      for (const l of lines) {
        assert.doesNotMatch(l, /AgentInfo|AgentState/, l);
        assert.match(l, /\(\s*(_?dtMs: number, _?world: World|_?world: World)\s*\)/, l);
      }
    }
  });

  void it('World exposes no roster, hero list, or host channel', () => {
    const entity = code('src/game/entities/Entity.ts');
    const world = blockAt(entity, entity.indexOf('{', entity.indexOf('export interface World')));
    const fields = [...world.matchAll(/readonly\s+(\w+)\s*:/g)].map((m) => m[1]).sort();
    assert.deepEqual(fields, [
      'cache',
      'campfire',
      'effects',
      'engagement',
      'particles',
      'rng',
      'stage',
      'summons',
    ]);
  });

  void it('the hook arguments are the World only: the only callers are Hero.ts update paths', () => {
    assert.deepEqual(
      filesMatching(gameFiles, /\.(onAttackStrike|shouldCastAbility|onAbilityRelease)\s*\(/),
      ['src/game/entities/Hero.ts'],
    );
  });
});

void describe('classFor reads nothing but the id', () => {
  const src = code('src/game/data/classMap.ts');

  void it('imports only hashId and the class list', () => {
    assert.deepEqual([...new Set(importSpecifiers(src))].sort(), ['../rng', './classes']);
    assert.match(src, /import \{ hashId \} from '\.\.\/rng'/);
  });

  void it('the class slice starts at bit 20 (changing it reshuffles every hero; pinned on purpose)', () => {
    assert.match(src, /\bconst CLASS_SHIFT\s*=\s*20\s*;/);
    assert.match(src, /hashId\(id\)\s*>>>\s*CLASS_SHIFT/);
  });

  void it('classFor takes one string id and its body uses only that id, hashId, and the delivered list', () => {
    const sig = src.indexOf('export function classFor(id: string): ClassId');
    assert.ok(sig >= 0);
    const body = blockAt(src, src.indexOf('{', sig));
    assert.doesNotMatch(
      body,
      /Date|Math\.random|performance|toolName|state|name\b|timestamp|globalThis|process/,
    );
    const identifiers = new Set([...body.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((m) => m[1] ?? ''));
    for (const allowed of [
      'id',
      'hashId',
      'DELIVERED_CLASSES',
      'CLASS_SHIFT',
      'index',
      'const',
      'length',
      'return',
    ]) {
      identifiers.delete(allowed);
    }
    assert.deepEqual(
      [...identifiers].sort(),
      ['warrior'],
      'only the fixed fallback literal remains',
    );
  });
});

void describe('every phase switch knows ability (invariant 2, cosmetic phase)', () => {
  void it('each switch over the hero phase lists case ability and ends in assertNever', () => {
    const src = code('src/game/entities/Hero.ts');
    let found = 0;
    for (const m of src.matchAll(/\bswitch\s*\(([^)]*)\)\s*\{/g)) {
      if (!/#phase|\.phase/.test(m[1] ?? '')) {
        continue;
      }
      found += 1;
      const body = blockAt(src, (m.index ?? 0) + m[0].length - 1);
      assert.match(body, /case 'ability':/, `switch (${m[1]})`);
      assert.match(body, /\bdefault\s*:[\s\S]*\bassertNever\s*\(/);
    }
    assert.ok(found >= 3, `found ${found} phase switches`);
  });

  void it('the HeroPhase union includes ability, and Roster.countFighting counts it', () => {
    assert.match(code('src/game/entities/Hero.ts'), /\|\s*'ability'/);
    const roster = code('src/game/Roster.ts');
    const count = blockAt(roster, roster.indexOf('{', roster.indexOf('countFighting()')));
    assert.match(count, /'advance'[\s\S]*'attack'[\s\S]*'ability'/);
  });

  void it('no other file switches on a hero phase', () => {
    // Summon.ts switches on its own SummonPhase (rise, active, sink), which is not a hero phase.
    const offenders = gameFiles
      .filter((f) => f !== 'src/game/entities/Hero.ts' && f !== 'src/game/entities/Summon.ts')
      .filter((f) => /\bswitch\s*\([^)]*\bphase\b[^)]*\)/.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it("Summon.ts's phase switch handles only rise, active, and sink, and ends in assertNever", () => {
    const src = code('src/game/entities/Summon.ts');
    const m = /\bswitch\s*\(([^)]*phase[^)]*)\)\s*\{/.exec(src);
    assert.ok(m, 'Summon.ts has a phase switch');
    const body = blockAt(src, (m?.index ?? 0) + (m?.[0].length ?? 1) - 1);
    const cases = [...body.matchAll(/case '(\w+)':/g)].map((c) => c[1]).sort();
    assert.deepEqual(cases, ['active', 'rise', 'sink']);
    assert.match(body, /\bdefault\s*:[\s\S]*\bassertNever\s*\(/);
  });
});

void describe('art files for classes carry characters only (invariant 5)', () => {
  void it('class, effect, and summon template files hold no hex colour and no data URI', () => {
    for (const f of [
      'src/game/sprites/classTemplates.ts',
      'src/game/sprites/effectTemplates.ts',
      'src/game/sprites/classTemplatesH2.ts',
      'src/game/sprites/effectTemplatesH2.ts',
      'src/game/sprites/summonTemplates.ts',
    ]) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:/, f);
    }
  });
});
