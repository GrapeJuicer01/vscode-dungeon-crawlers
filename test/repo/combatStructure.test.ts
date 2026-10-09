// Structural checks for the E1 seam (E1 plan section 2.1 and test note 10; ADR 0013; Core
// invariants 1 to 3). The enemy side is a literal list of eight files (test/support/sides.ts);
// everything else is hero side by default. These tests prove the sides meet only at the two
// buffers: heroes -> FighterBuffer (numbers) -> Combat, and Combat -> HitReactions -> Hero.draw.
// Comments are stripped before scanning.
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { listFiles } from '../support/repo';
import { blockAt, code, filesMatching, importSpecifiers } from '../support/source';
import { BOTH_SIDES_WIRING, ENEMY_SIDE, ENEMY_SIDE_FORBIDDEN_IDENTIFIERS } from '../support/sides';

const gameFiles = listFiles('src/game').filter((f) => f.endsWith('.ts'));
const heroSide = gameFiles.filter((f) => !ENEMY_SIDE.includes(f));

/** Repo-relative target of a relative import specifier (without extension). */
function resolveImport(from: string, specifier: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
}

/** The enemy-side files an enemy-side file may import besides other enemy-side files. */
const ENEMY_MAY_IMPORT = new Set([
  'src/game/Fighters',
  'src/game/HitReactions',
  'src/game/Particles',
  'src/game/entities/Entity',
  'src/game/rng',
  'src/game/layout',
  'src/game/ports',
  'src/game/Stage',
  'src/game/data/tuning',
  'src/game/data/animations',
  'src/game/data/stages',
]);

void describe('the two sides of the seam (invariants 1 and 2; ADR 0013)', () => {
  void it('a file that looks like enemy code is on the enemy-side list (a forgotten file would only get the strict ban)', () => {
    const lookalikes = gameFiles.filter(
      (f) =>
        !f.startsWith('src/game/sprites/') &&
        /\/(Combat|Enemy|Boss|Drops?|Progression)\w*\.ts$/.test(f),
    );
    assert.ok(lookalikes.length >= 5);
    assert.deepEqual(
      lookalikes.filter((f) => !ENEMY_SIDE.includes(f)),
      [],
    );
  });

  void it('no hero-side file imports an enemy-side file, except Game, Renderer, Engagement (one import type), and the art validator', () => {
    const enemyTargets = new Set(ENEMY_SIDE.map((f) => f.replace(/\.ts$/, '')));
    const offenders: string[] = [];
    for (const f of heroSide.filter((x) => !BOTH_SIDES_WIRING.includes(x))) {
      for (const spec of importSpecifiers(code(f))) {
        if (spec.startsWith('.') && enemyTargets.has(resolveImport(f, spec))) {
          offenders.push(`${f} imports ${spec}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  void it('Engagement.ts imports the enemy side exactly once, as a type-only Combat import', () => {
    const src = code('src/game/Engagement.ts');
    const imports = [...src.matchAll(/^import\b[^;]*;/gm)].map((m) => m[0]);
    const enemyImports = imports.filter((line) => /Combat|Enemy|Boss|Drops|Progression/.test(line));
    assert.deepEqual(enemyImports, ["import type { Combat } from './Combat';"]);
    assert.match(src, /Pick<Combat, 'inContact' \| 'disabled'>/);
    // Only those two members are ever read.
    assert.deepEqual(
      [...new Set([...src.matchAll(/this\.#combat\.(\w+)/g)].map((m) => m[1]))].sort(),
      ['disabled', 'inContact'],
    );
  });

  void it('the sprite cache imports only the ENEMIES data from the enemy side, to map an enemy id to its stage', () => {
    const src = code('src/game/sprites/spriteFactory.ts');
    const lines = [...src.matchAll(/^import\b[^;]*;/gm)]
      .map((m) => m[0])
      .filter((line) => /data\/(enemies|drops)'|Combat|Enemy|Boss|Drops/.test(line));
    assert.deepEqual(lines, ["import { ENEMIES } from '../data/enemies';"]);
    assert.doesNotMatch(src, /\b(Combat|Boss|HitReactions|Fighter\w*)\b/);
  });

  void it('the Renderer and the art validator reach the enemy side only for types and rows, never to change a hero', () => {
    for (const f of ['src/game/Renderer.ts', 'src/game/sprites/spriteValidator.ts']) {
      assert.doesNotMatch(code(f), /applyAgentState|\.lifecycle\b|\bRoster\b/, f);
    }
  });

  void it('enemy-side files import only each other and the allowed support modules (plus src/shared/progress)', () => {
    const enemyTargets = new Set(ENEMY_SIDE.map((f) => f.replace(/\.ts$/, '')));
    for (const f of ENEMY_SIDE) {
      for (const spec of importSpecifiers(code(f))) {
        assert.ok(spec.startsWith('.'), `${f} imports the package ${spec}`);
        const target = resolveImport(f, spec);
        const ok =
          enemyTargets.has(target) ||
          ENEMY_MAY_IMPORT.has(target) ||
          target === 'src/shared/progress';
        assert.ok(ok, `${f} imports ${spec}`);
      }
    }
  });

  void it('the enemy side names no Hero, ClassHero, Roster, Summon, Effects, AgentInfo, AgentState, applyAgentState, lifecycle, or exiting', () => {
    for (const f of ENEMY_SIDE) {
      assert.doesNotMatch(code(f), ENEMY_SIDE_FORBIDDEN_IDENTIFIERS, f);
    }
  });

  void it('the enemy side cannot reach the protocol, the host, or a channel', () => {
    for (const f of ENEMY_SIDE) {
      const text = code(f);
      for (const spec of importSpecifiers(text)) {
        assert.doesNotMatch(spec, /protocol|webview|host|monitor|vscode/, `${f}: ${spec}`);
      }
      assert.doesNotMatch(text, /\.send\s*\(|postMessage|globalState|localStorage|HostChannel/, f);
    }
  });

  void it('World still has exactly the eight H3 fields: no combat, enemies, or reactions field', () => {
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
    assert.doesNotMatch(world, /combat|enem|reaction|fighter|boss/i);
  });

  void it('DrawContext gains exactly one field, reactions, and Entity.ts only reads it as a type', () => {
    const entity = code('src/game/entities/Entity.ts');
    const ctx = blockAt(
      entity,
      entity.indexOf('{', entity.indexOf('export interface DrawContext')),
    );
    assert.deepEqual([...ctx.matchAll(/readonly\s+(\w+)\s*:/g)].map((m) => m[1]).sort(), [
      'camera',
      'reactions',
      'surface',
      'world',
    ]);
  });
});

void describe('the reaction board is the only enemy-to-hero channel (invariant 1)', () => {
  void it('HitReactions.flash( is called only in Combat.ts, and nowhere else but its own definition', () => {
    assert.deepEqual(filesMatching(gameFiles, /\.flash\s*\(/), ['src/game/Combat.ts']);
    assert.deepEqual(filesMatching(gameFiles, /\bflash\s*\(\s*slot\b/), [
      'src/game/HitReactions.ts',
    ]);
  });

  void it('Combat calls reactions.flash only from #landAttack, with the push sign -1 and nothing else about a hero', () => {
    const src = code('src/game/Combat.ts');
    const calls = [...src.matchAll(/this\.#reactions\.(\w+)\(/g)].map((m) => m[1]);
    assert.ok(calls.length >= 2);
    assert.ok(
      calls.every((c) => c === 'flash'),
      calls.join(),
    );
    const body = blockAt(src, src.indexOf('{', src.indexOf('#landAttack(fighters: FighterBuffer')));
    assert.equal((body.match(/this\.#reactions\.flash\(/g) ?? []).length, 2);
    assert.match(body, /flash\([^)]*,\s*-1,\s*(true|false)\)/);
    assert.equal((src.match(/\.flash\(/g) ?? []).length, 2, 'no other call site');
  });

  void it('Hero.ts only reads the board: flashing( and offsetPx(, never flash(, update(, or clear(', () => {
    const src = code('src/game/entities/Hero.ts');
    const members = [...src.matchAll(/\breactions\.(\w+)/g)].map((m) => m[1]).sort();
    assert.deepEqual(members, ['flashing', 'offsetPx']);
  });

  void it('only Game.ts updates and clears the board', () => {
    assert.deepEqual(
      filesMatching(gameFiles, /\b(#reactions|reactions)\.(update|clear)\s*\(/).sort(),
      ['src/game/Game.ts'],
    );
  });

  void it('HitReactions.ts holds only numbers per slot and no kind, amount of damage, or hero reference', () => {
    const src = code('src/game/HitReactions.ts');
    assert.doesNotMatch(src, /import\b[^;]*from\s*'[^']*(Hero|Roster|Entity|Combat|Enemy)/);
    assert.doesNotMatch(src, /\b(kind|type|damage|hp|health|lifecycle|phase|state)\b/i);
    const fields = [...src.matchAll(/readonly #(\w+):\s*(\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    assert.ok(fields.length >= 5);
    for (const field of fields) {
      assert.match(field, /:(Float32Array|Int8Array|Uint8Array|number)$/, field);
    }
  });

  void it('the hero draw reads the board but never writes a hero field from it', () => {
    const src = code('src/game/entities/Hero.ts');
    const draw = blockAt(src, src.indexOf('{', src.indexOf('  draw(ctx: DrawContext): void')));
    assert.match(draw, /ctx\.reactions\.flashing\(/);
    assert.match(draw, /ctx\.reactions\.offsetPx\(/);
    assert.doesNotMatch(draw, /this\.#(x|y|phase|lifecycle|faceRight)\s*(\+|-)?=[^=]/);
    assert.doesNotMatch(draw, /\bfillRect\b|\bstrokeRect\b/);
  });

  void it('no health bar, bar frame, or bar fill is referenced anywhere on the hero side', () => {
    const offenders = heroSide
      .filter((f) => !f.startsWith('src/game/sprites/'))
      .filter((f) => !BOTH_SIDES_WIRING.includes(f))
      .filter((f) =>
        /\b(barFrame|barChars|drawBar|enemyBar|bossBar|fillChar|backChar)\b/.test(code(f)),
      );
    assert.deepEqual(offenders, []);
  });

  void it('only Enemy.ts draws a bar: it is the only entity that calls fillRect', () => {
    const entities = gameFiles.filter((f) => f.startsWith('src/game/entities/'));
    assert.deepEqual(filesMatching(entities, /\bfillRect\s*\(/), ['src/game/entities/Enemy.ts']);
    assert.deepEqual(filesMatching(entities, /\bbarFrame\s*\(/), ['src/game/entities/Enemy.ts']);
  });
});

void describe('the fighter buffer is the only hero-to-enemy channel (invariants 1 and 2)', () => {
  void it('FighterBuffer holds typed numeric arrays and a count, and imports nothing', () => {
    const src = code('src/game/Fighters.ts');
    assert.deepEqual(importSpecifiers(src), []);
    const fields = [...src.matchAll(/readonly\s+(\w+):\s*(\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
    assert.deepEqual(fields.sort(), [
      'abilitySerial:Int32Array',
      'slot:Int32Array',
      'strikeSerial:Int32Array',
      'x:Float32Array',
      'y:Float32Array',
    ]);
    assert.doesNotMatch(src, /\b(string|AgentInfo|id|name|classId|lifecycle|Hero)\b/);
  });

  void it('Roster.collectFighters lists only advance, attack, and ability heroes and writes nothing to a hero', () => {
    const src = code('src/game/Roster.ts');
    const body = blockAt(
      src,
      src.indexOf('{', src.indexOf('collectFighters(out: FighterBuffer): void')),
    );
    assert.match(
      body,
      /hero\.phase === 'advance' \|\| hero\.phase === 'attack' \|\| hero\.phase === 'ability'/,
    );
    assert.match(
      body,
      /out\.push\(hero\.slot, hero\.x, hero\.y, hero\.strikeSerial, hero\.abilitySerial\)/,
    );
    assert.doesNotMatch(body, /\bhero\.\w+\s*(\+\+|--|[+\-*/]?=[^=])/);
    assert.doesNotMatch(body, /\bhero\.(id|name|classId|lifecycle|look)\b/);
  });

  void it('Hero.ts bumps the two serials only by increment, once each, and never reads lifecycle for them', () => {
    const src = code('src/game/entities/Hero.ts');
    assert.equal((src.match(/this\.#strikeSerial\+\+/g) ?? []).length, 1);
    assert.equal((src.match(/this\.#abilitySerial\+\+/g) ?? []).length, 1);
    assert.equal((src.match(/#strikeSerial\s*=[^=]/g) ?? []).length, 1, 'only the initializer');
    assert.equal((src.match(/#abilitySerial\s*=[^=]/g) ?? []).length, 1, 'only the initializer');
    assert.match(src, /get strikeSerial\(\): number \{\s*return this\.#strikeSerial;\s*\}/);
    assert.match(src, /get abilitySerial\(\): number \{\s*return this\.#abilitySerial;\s*\}/);
    // The increments sit directly before the hooks that already existed.
    assert.match(src, /this\.#strikeSerial\+\+;\s*this\.onAttackStrike\(world\);/);
    assert.match(src, /this\.#abilitySerial\+\+;\s*this\.onAbilityRelease\(world\);/);
  });

  void it('ClassHero.ts is not edited by E1: it names no serial, fighter, or reaction and has no draw', () => {
    const src = code('src/game/entities/ClassHero.ts');
    assert.doesNotMatch(src, /Serial|Fighter|reaction|Combat|Enemy/i);
    assert.doesNotMatch(src, /\bdraw\s*\(/);
  });

  void it('Combat.update is called only from Game.ts, inside its own try/catch that records a fault', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bcombat\.update\s*\(|#combat\.update\s*\(/), [
      'src/game/Game.ts',
    ]);
    const src = code('src/game/Game.ts');
    const body = blockAt(src, src.indexOf('{', src.indexOf('#updateCombat(world: World): void')));
    assert.match(
      body,
      /try\s*\{[\s\S]*this\.#combat\.update\([\s\S]*\}\s*catch\s*\(error: unknown\)\s*\{[\s\S]*this\.#combat\.recordFault\(\)/,
    );
  });

  void it('summons are never fighters: the Roster, the buffer, and Combat know no Summon', () => {
    for (const f of [
      'src/game/Roster.ts',
      'src/game/Fighters.ts',
      'src/game/Combat.ts',
      'src/game/HitReactions.ts',
    ]) {
      assert.doesNotMatch(code(f), /\bSummon\w*|\bsummons?\b/i, f);
    }
    // Game fills the buffer from the roster alone: no summon pool is passed to collectFighters.
    assert.match(code('src/game/Game.ts'), /this\.#roster\.collectFighters\(this\.#fighters\)/);
  });
});

void describe('lifecycle stays host-driven (invariant 2)', () => {
  void it('applyAgentState( is still defined only in Hero.ts and called only in Roster.ts', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bapplyAgentState\s*\(/).sort(), [
      'src/game/Roster.ts',
      'src/game/entities/Hero.ts',
    ]);
  });

  void it('lifecycle is assigned only in Hero.ts, which keeps exactly two assignments', () => {
    const offenders = gameFiles
      .filter((f) => f !== 'src/game/entities/Hero.ts')
      .filter((f) => /\b#?lifecycle\s*=[^=]/.test(code(f)));
    assert.deepEqual(offenders, []);
    assert.equal(
      (code('src/game/entities/Hero.ts').match(/this\.#lifecycle\s*=[^=]/g) ?? []).length,
      2,
    );
  });

  void it('the Roster is touched by no combat, stage, or progress callback in Game.ts', () => {
    const src = code('src/game/Game.ts');
    for (const callback of ['onStageClear', 'onProgress']) {
      const at = src.indexOf(`${callback}:`);
      assert.ok(at >= 0, callback);
      const line = src.slice(at, src.indexOf('\n', at));
      assert.doesNotMatch(line, /roster|apply|despawn/i, line);
    }
    // applyProgress and applyConfig never name the roster.
    for (const name of [
      'applyProgress(progress: Progress): void',
      'applyConfig(config: GameConfig): void',
    ]) {
      const body = blockAt(src, src.indexOf('{', src.indexOf(name)));
      assert.doesNotMatch(body, /roster/i, name);
    }
  });

  void it('the stage director and progression never see a hero or the roster', () => {
    for (const f of ['src/game/StageDirector.ts', 'src/game/Progression.ts']) {
      assert.doesNotMatch(code(f), /\b(Hero|Roster|applyAgentState|AgentInfo|lifecycle)\b/, f);
    }
  });
});

void describe('drops are decoration (decision E1-12)', () => {
  void it('the drop kinds are exactly coin, gem, ore, and chest', () => {
    const src = code('src/game/data/drops.ts');
    assert.match(src, /DROP_KINDS\s*=\s*\['coin',\s*'gem',\s*'ore',\s*'chest'\]\s*as const/);
  });

  void it('no identifier in the drop files suggests healing, potions, armor, or buffs', () => {
    for (const f of ['src/game/data/drops.ts', 'src/game/Drops.ts']) {
      const identifiers = [...code(f).matchAll(/\b[A-Za-z_]\w*\b/g)].map((m) => m[0]);
      const bad = identifiers.filter((id) =>
        /heal|potion|restore|armor|buff|inventory|collect|pickup/i.test(id),
      );
      assert.deepEqual([...new Set(bad)], [], f);
    }
  });

  void it('nothing reads a drop: Drops exposes a count and draws, and no other file imports it but Combat', () => {
    assert.deepEqual(filesMatching(gameFiles, /import\b[^;]*\bDrops\b[^;]*from/), [
      'src/game/Combat.ts',
    ]);
    const src = code('src/game/Drops.ts');
    assert.doesNotMatch(src, /\bHero|Roster|reaction|progress|kills?\b/i);
  });
});

void describe('persistence boundaries (invariants 3 and 7)', () => {
  void it('src/game/** has no .send(, postMessage, globalState, localStorage, or sessionStorage', () => {
    assert.deepEqual(
      filesMatching(
        gameFiles,
        /\.send\s*\(|\bpostMessage\b|\bglobalState\b|\blocalStorage\b|\bsessionStorage\b/,
      ),
      [],
    );
  });

  void it('the engine reports progress only through a numeric callback (onProgress); only Game.ts takes a value (MAX_AGENTS) from the protocol', () => {
    for (const f of gameFiles) {
      const statements = [...code(f).matchAll(/^import\b[^;]*?from\s*'([^']*protocol)';/gm)];
      for (const statement of statements) {
        const text = statement[0];
        if (/^import type\b/.test(text)) {
          continue;
        }
        assert.equal(f, 'src/game/Game.ts', `${f} takes a value from the protocol`);
        assert.equal(text, "import { MAX_AGENTS } from '../shared/protocol';");
      }
    }
    assert.deepEqual(filesMatching(gameFiles, /\bonProgress\b/).sort(), [
      'src/game/Combat.ts',
      'src/game/Game.ts',
    ]);
  });

  void it('src/host/** imports no vscode, node:, monitor, or game module (progress files included)', () => {
    for (const f of listFiles('src/host').filter((x) => x.endsWith('.ts'))) {
      for (const spec of importSpecifiers(code(f))) {
        assert.doesNotMatch(spec, /vscode|^node:|monitor|game|^\.\.\/webview/, `${f}: ${spec}`);
      }
    }
    // The store takes the logger's type from the bridge file and nothing else of it (a type import).
    assert.match(
      code('src/host/progressStore.ts'),
      /^import type \{ BridgeLogger \} from '\.\/webviewBridge';$/m,
    );
  });

  void it('the progress files hold no string field, no agent word, and log only string literals', () => {
    const shared = code('src/shared/progress.ts');
    const iface = blockAt(shared, shared.indexOf('{', shared.indexOf('export interface Progress')));
    const types = [...iface.matchAll(/readonly\s+\w+\s*:\s*([^;]+);/g)].map((m) =>
      (m[1] ?? '').trim(),
    );
    assert.equal(types.length, 6);
    assert.ok(
      types.every((t) => t === 'number' || t === 'typeof PROGRESS_SCHEMA_VERSION'),
      types.join(),
    );
    assert.doesNotMatch(shared, /\b(AgentInfo|agentId|toolName|sessionId|transcript)\b/i);
    for (const f of ['src/host/progressStore.ts', 'src/host/progressMigrations.ts']) {
      const text = code(f);
      assert.doesNotMatch(text, /\b(AgentInfo|agentId|toolName|transcript)\b/i, f);
    }
    // Every log call in the store is a fixed literal (no interpolation, no error text).
    const store = code('src/host/progressStore.ts');
    const logs = [...store.matchAll(/this\.#log\(([^)]*)\)/g)].map((m) => (m[1] ?? '').trim());
    assert.ok(logs.length >= 6);
    for (const arg of logs) {
      assert.match(arg, /^'[^'$`]*'$/, arg);
    }
  });
});
