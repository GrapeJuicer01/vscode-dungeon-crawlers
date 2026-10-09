// Structural checks for H2 summons (H2 plan test note 10; ADR 0011; Core invariants 1 and 2).
// Summon.ts, Summons.ts, and data/summons.ts are scanned with comments stripped. The summon code
// has no health vocabulary (the ban list grew by heal regen restore revive resurrect), imports no
// hero, roster, or engagement, draws no rectangles, and cannot name a lifecycle.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listFiles } from '../support/repo';
import { blockAt, code, filesMatching, importSpecifiers } from '../support/source';

const SUMMON_FILES = [
  'src/game/entities/Summon.ts',
  'src/game/Summons.ts',
  'src/game/data/summons.ts',
] as const;
const gameFiles = listFiles('src/game').filter((f) => f.endsWith('.ts'));
const CODE_ONLY = ['src/game/entities/Summon.ts', 'src/game/Summons.ts'] as const;
const BANNED =
  /\b(hp|health|mana|dead|downed|retreat|damage|gauge|heal|regen|restore|revive|resurrect)\b/i;

void describe('summon vocabulary (invariant 1)', () => {
  void it('the files exist', () => {
    for (const f of SUMMON_FILES) {
      assert.ok(gameFiles.includes(f), f);
    }
  });

  void it('no hp, health, mana, dead, downed, retreat, damage, gauge, heal, regen, restore, revive, or resurrect', () => {
    const offenders = [
      ...SUMMON_FILES,
      'src/game/data/classes.ts',
      'src/game/data/classMap.ts',
    ].filter((f) => BANNED.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it('the widened ban holds across every file under src/game except the validator and the Surface port note', () => {
    // ports.ts says callers "restore" the canvas composite; that is canvas state, not health.
    const allowed = new Set(['src/game/sprites/spriteValidator.ts', 'src/game/ports.ts']);
    const offenders = gameFiles.filter((f) => !allowed.has(f)).filter((f) => BANNED.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it('no gauge vocabulary or hit semantics: no bar, meter, target, hit, or flash in the summon files', () => {
    for (const f of SUMMON_FILES) {
      assert.doesNotMatch(
        code(f),
        /\b(healthbar|hpbar|bar|meter|progressbar|target|hitbox|hit|flash|knockback|stagger)\b/i,
        f,
      );
    }
  });
});

void describe('summons cannot reach a hero (invariant 2)', () => {
  void it('Summon.ts and Summons.ts import none of Hero, ClassHero, Roster, Engagement, or Game', () => {
    for (const f of CODE_ONLY) {
      const src = code(f);
      for (const spec of importSpecifiers(src)) {
        assert.doesNotMatch(
          spec,
          /Hero|Roster|Engagement|Game|protocol|webview|host|monitor/,
          `${f}: ${spec}`,
        );
      }
      assert.doesNotMatch(src, /\b(Hero|ClassHero|Roster|Engagement)\b/, f);
    }
  });

  void it('they contain no applyAgentState, lifecycle, fillRect, or strokeRect', () => {
    for (const f of CODE_ONLY) {
      assert.doesNotMatch(
        code(f),
        /\b(applyAgentState|lifecycle|AgentInfo|AgentState|fillRect|strokeRect|fillText)\b/,
        f,
      );
    }
  });

  void it('no exported SummonPool method takes a Hero, an AgentInfo, or an id string', () => {
    const src = code('src/game/Summons.ts');
    const body = blockAt(src, src.indexOf('{', src.indexOf('export class SummonPool')));
    const signatures = [
      ...body.matchAll(/^\s{2}(?:get\s+)?([a-z]\w*)\s*\(([^)]*)\)\s*:\s*[^{]+\{/gm),
    ];
    assert.ok(signatures.length >= 5, signatures.map((m) => m[1]).join());
    for (const m of signatures) {
      assert.doesNotMatch(
        m[2] ?? '',
        /\b(Hero|ClassHero|AgentInfo|AgentState)\b|:\s*string\b/,
        `${m[1]}(${m[2]})`,
      );
    }
    const names = signatures.map((m) => m[1]);
    for (const required of ['raise', 'renew', 'update', 'clear', 'entities']) {
      assert.ok(names.includes(required), required);
    }
  });

  void it('Summon extends GuardedEntity, not Hero; nothing in the roster knows Summon', () => {
    assert.match(code('src/game/entities/Summon.ts'), /class Summon extends GuardedEntity\b/);
    assert.doesNotMatch(code('src/game/entities/Summon.ts'), /extends\s+Hero\b/);
    for (const f of ['src/game/Roster.ts', 'src/game/entities/Hero.ts']) {
      assert.doesNotMatch(code(f), /\bSummon(Pool)?\b|Summons'/, f);
    }
  });

  void it('Summon and SummonPool are constructed only by the Game and the pool itself', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bnew\s+SummonPool\s*\(/), ['src/game/Game.ts']);
    assert.deepEqual(filesMatching(gameFiles, /\bnew\s+Summon\s*\(/), ['src/game/Summons.ts']);
  });

  void it('ClassHero.ts still does not import Roster and may import SummonPose only as a type', () => {
    const src = code('src/game/entities/ClassHero.ts');
    assert.doesNotMatch(src, /\bRoster\b/);
    const imports = [...src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g)].filter(
      (m) => /Summon/.test(m[3] ?? ''),
    );
    for (const m of imports) {
      assert.equal(m[1]?.trim(), 'type', `non-type import from ${m[3]}`);
      assert.equal(m[2]?.trim(), 'SummonPose');
    }
    assert.doesNotMatch(src, /\bSummonPool\b|\bnew\s+Summon\b/);
  });

  void it('only ClassHero.ts calls the pool from entity code (raise and renew); only Game.ts updates and clears it', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bsummons\.(raise|renew)\s*\(/).sort(), [
      'src/game/entities/ClassHero.ts',
    ]);
    assert.deepEqual(filesMatching(gameFiles, /\bsummons\.(update|clear)\s*\(/).sort(), [
      'src/game/Game.ts',
    ]);
  });

  void it('applyAgentState( is still defined only in Hero.ts and called only in Roster.ts; lifecycle is assigned only in Hero.ts', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bapplyAgentState\s*\(/).sort(), [
      'src/game/Roster.ts',
      'src/game/entities/Hero.ts',
    ]);
    const offenders = gameFiles
      .filter((f) => f !== 'src/game/entities/Hero.ts')
      .filter((f) => /\b#?lifecycle\s*=[^=]/.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it('ClassHero reads only phase, slot, position, and facing for the summon (never lifecycle)', () => {
    const src = code('src/game/entities/ClassHero.ts');
    const tend = blockAt(src, src.indexOf('{', src.indexOf('#tendSummon(world: World)')));
    assert.doesNotMatch(tend, /lifecycle|exiting|removable|classId|info\b/);
    assert.match(tend, /this\.phase/);
    assert.match(tend, /this\.slot/);
  });

  void it('Combat.ts (E1) must not import Summons.ts', () => {
    for (const f of gameFiles.filter((x) => /\/Combat\.ts$/.test(x))) {
      for (const spec of importSpecifiers(code(f))) {
        assert.doesNotMatch(spec, /Summons?$/, `${f}: ${spec}`);
      }
    }
  });
});

void describe('every switch over a summon phase ends in assertNever', () => {
  void it('Summon.ts: each phase switch has a default that calls assertNever', () => {
    const src = code('src/game/entities/Summon.ts');
    let found = 0;
    for (const m of src.matchAll(/\bswitch\s*\(([^)]*)\)\s*\{/g)) {
      found += 1;
      const body = blockAt(src, (m.index ?? 0) + m[0].length - 1);
      assert.match(body, /\bdefault\s*:[\s\S]*\bassertNever\s*\(/, `switch (${m[1]})`);
    }
    assert.ok(found >= 1);
  });

  void it('no other file switches on a summon phase', () => {
    const offenders = gameFiles
      .filter((f) => f !== 'src/game/entities/Summon.ts')
      .filter((f) => /\bswitch\s*\([^)]*\bphase\b/.test(code(f)) && /SummonPhase/.test(code(f)));
    assert.deepEqual(offenders, []);
  });
});

void describe('the summon art is characters only (invariant 5)', () => {
  void it('no hex colour, data URI, or external file reference in the summon sources', () => {
    for (const f of ['src/game/sprites/summonTemplates.ts', ...SUMMON_FILES]) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:|\.png|\.gif|\.svg|\.wav|\.mp3/, f);
    }
  });
});
