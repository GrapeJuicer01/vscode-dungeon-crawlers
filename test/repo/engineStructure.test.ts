// Structural checks for the engine (M4 plan test note 10; Core invariants 1 to 4):
// the hero carries no health, mana, death, or retreat vocabulary and no gauge; lifecycle has one
// writer; the engine is DOM-free and deterministic; the webview glue never talks to the host.
// E1 (ADR 0013): the vocabulary ban runs over every file that is not on the enemy side (a literal
// list in test/support/sides.ts; a new file is hero side by default), and the enemy side keeps its
// own, smaller ban.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listFiles } from '../support/repo';
import { ENEMY_SIDE, ENEMY_SIDE_BANNED, HERO_SIDE_BANNED } from '../support/sides';
import { blockAt, code, filesMatching, importSpecifiers } from '../support/source';
import path from 'node:path';

const gameFiles = listFiles('src/game').filter((f) => f.endsWith('.ts'));
const heroFiles = [
  ...gameFiles.filter((f) => f.startsWith('src/game/entities/')),
  'src/game/Roster.ts',
  'src/game/Engagement.ts',
  'src/game/Game.ts',
  'src/game/sprites/heroTemplates.ts',
  'src/game/sprites/spriteFactory.ts',
];

/** The validator names the banned animation words on purpose, to reject them. */
const VALIDATOR = 'src/game/sprites/spriteValidator.ts';

void describe('hero structure (invariant 1)', () => {
  void it('scans the expected files', () => {
    for (const f of [
      'src/game/entities/Hero.ts',
      'src/game/entities/Entity.ts',
      'src/game/Roster.ts',
      'src/game/Game.ts',
    ]) {
      assert.ok(gameFiles.includes(f), f);
    }
  });

  void it('no hero, roster, or engine code names hp, health, mana, dead, downed, retreat, damage, or gauge (every file except the eight enemy-side files and the validator)', () => {
    const offenders = gameFiles
      .filter((f) => f !== VALIDATOR && !ENEMY_SIDE.includes(f))
      .filter((f) => HERO_SIDE_BANNED.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it('the enemy side is exactly eight files, all of which exist', () => {
    assert.equal(ENEMY_SIDE.length, 8);
    assert.equal(new Set(ENEMY_SIDE).size, 8);
    for (const f of ENEMY_SIDE) {
      assert.ok(gameFiles.includes(f), f);
    }
  });

  void it('the enemy side may say health but never mana, dead, downed, retreat, hurt, dying, gauge, heal, regen, restore, revive, or resurrect', () => {
    for (const f of ENEMY_SIDE) {
      assert.doesNotMatch(code(f), ENEMY_SIDE_BANNED, f);
    }
    // And it really is the only place the health vocabulary lives.
    const withHealth = gameFiles
      .filter((f) => f !== VALIDATOR)
      .filter((f) => /\b(hp|health|damage)\b/i.test(code(f)));
    assert.ok(
      withHealth.every((f) => ENEMY_SIDE.includes(f)),
      withHealth.join(),
    );
    assert.ok(withHealth.includes('src/game/entities/Enemy.ts'));
  });

  void it('the hero-named files also have no health-bar vocabulary (bar, meter, healthbar)', () => {
    for (const f of heroFiles.filter((file) => !ENEMY_SIDE.includes(file))) {
      assert.doesNotMatch(code(f), /\b(healthbar|hpbar|manabar|meter|progressbar)\b/i, f);
    }
  });

  void it('the validator uses the banned words only to reject animation names', () => {
    const src = code(VALIDATOR);
    assert.match(src, /FORBIDDEN_HERO_ANIMATION\s*=\s*\/hurt\|downed\|death\|dead\|die\|dying\/i/);
    assert.match(
      src,
      /FORBIDDEN_ENEMY_ANIMATION\s*=\s*\/hit\|death\|dead\|die\|dying\|hurt\|downed\/i/,
    );
    const uses = src.split('\n').filter((l) => /\b(hurt|downed|death|dead|dying)\b/.test(l));
    assert.equal(uses.length, 2, uses.join('\n'));
    assert.ok(
      uses.every((l) => /FORBIDDEN_(HERO|ENEMY)_ANIMATION\s*=/.test(l)),
      uses.join('\n'),
    );
  });

  void it('Hero and Campfire draw only bitmaps: no fillRect, strokeRect, arc, or text', () => {
    for (const f of [
      'src/game/entities/Hero.ts',
      'src/game/entities/Campfire.ts',
      'src/game/entities/Prop.ts',
    ]) {
      assert.doesNotMatch(
        code(f),
        /\b(fillRect|strokeRect|fillText|strokeText|arc|lineTo|clearRect|fill)\s*\(/,
        f,
      );
    }
    assert.match(code('src/game/entities/Hero.ts'), /\bdrawBitmap(Region)?\(/);
  });

  void it('the Surface port offers no text or gauge primitive', () => {
    const port = code('src/game/ports.ts');
    assert.doesNotMatch(port, /\b(fillText|strokeText|drawText|drawBar|gauge)\b/i);
  });
});

void describe('lifecycle has one writer (invariant 2)', () => {
  void it('applyAgentState is defined only in Hero.ts and called only in Roster.ts', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bapplyAgentState\s*\(/).sort(), [
      'src/game/Roster.ts',
      'src/game/entities/Hero.ts',
    ]);
    assert.deepEqual(filesMatching(gameFiles, /\bapplyAgentState\s*\([^)]*\)\s*:\s*void\s*\{/), [
      'src/game/entities/Hero.ts',
    ]);
    for (const f of listFiles('src').filter(
      (x) => x.endsWith('.ts') && !x.startsWith('src/game/'),
    )) {
      assert.doesNotMatch(code(f), /\bapplyAgentState\b/, f);
    }
  });

  void it('#lifecycle is assigned only in the constructor and inside applyAgentState', () => {
    const src = code('src/game/entities/Hero.ts');
    const assignments = [...src.matchAll(/this\.#lifecycle\s*=[^=]/g)];
    assert.equal(assignments.length, 2);
    const ctorStart = src.indexOf('constructor(init: HeroInit)');
    const ctor = blockAt(src, src.indexOf('{', ctorStart));
    const apply = blockAt(
      src,
      src.indexOf('{', src.indexOf('applyAgentState(info: AgentInfo): void')),
    );
    for (const m of assignments) {
      const at = m.index ?? 0;
      const inCtor = at >= src.indexOf(ctor) && at < src.indexOf(ctor) + ctor.length;
      const inApply = at >= src.indexOf(apply) && at < src.indexOf(apply) + apply.length;
      assert.ok(
        inCtor || inApply,
        `assignment at ${at} is outside the constructor and applyAgentState`,
      );
    }
    assert.doesNotMatch(src, /\bset\s+lifecycle\b/);
  });

  void it('Roster is constructed and used only by Game.ts; heroes are built only by createHero in ClassHero.ts, which Game imports', () => {
    assert.deepEqual(filesMatching(gameFiles, /\bnew\s+Roster\s*\(/), ['src/game/Game.ts']);
    assert.deepEqual(filesMatching(gameFiles, /\bimport\b[^;]*\bRoster\b/).sort(), [
      'src/game/Game.ts',
    ]);
    // H1: the base Hero is never constructed by the engine; the default factory is createHero.
    assert.deepEqual(filesMatching(gameFiles, /\bnew\s+Hero\s*\(/), []);
    assert.deepEqual(filesMatching(gameFiles, /\bnew\s+ClassHero\s*\(/), [
      'src/game/entities/ClassHero.ts',
    ]);
    assert.deepEqual(filesMatching(gameFiles, /\bimport\b[^;]*\bcreateHero\b/), [
      'src/game/Game.ts',
    ]);
  });

  void it('engagement, camera, lighting, particles, pathfinding, and the renderer cannot reach Roster or Hero state', () => {
    for (const f of [
      'Engagement',
      'Camera',
      'Lighting',
      'Particles',
      'Pathfinding',
      'Ambience',
      'Collision',
    ]) {
      const src = code(`src/game/${f}.ts`);
      assert.doesNotMatch(src, /\bRoster\b|applyAgentState|\.lifecycle\b/, f);
    }
    assert.doesNotMatch(code('src/game/Renderer.ts'), /applyAgentState|\.lifecycle\b|Roster/);
  });

  void it('only host agent states are read as lifecycle; no phase or combat value flows into lifecycle', () => {
    const src = code('src/game/entities/Hero.ts');
    assert.doesNotMatch(src, /lifecycle\s*=\s*['"]/);
  });
});

void describe('engine purity (invariants 3, 4; ADR 0008)', () => {
  const BANNED_GLOBALS =
    /\b(document|window|requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval|fetch|performance|localStorage|sessionStorage|postMessage|acquireVsCodeApi|innerHTML|XMLHttpRequest|WebSocket)\b/;

  void it('no DOM, timer, storage, or messaging global in src/game/**', () => {
    const offenders = gameFiles.filter((f) => BANNED_GLOBALS.test(code(f)));
    assert.deepEqual(offenders, []);
  });

  void it('no Math.random, Date.now, new Date, or console in src/game/**', () => {
    assert.deepEqual(
      filesMatching(gameFiles, /\bMath\.random\b|\bDate\.now\b|\bnew\s+Date\b|\bconsole\./),
      [],
    );
  });

  void it('imports only src/shared and sibling game files: no webview, host, monitor, vscode, or node:', () => {
    for (const f of gameFiles) {
      for (const spec of importSpecifiers(code(f))) {
        assert.ok(spec.startsWith('.'), `${f} imports package ${spec}`);
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
        assert.ok(
          resolved.startsWith('src/shared/') || resolved.startsWith('src/game/'),
          `${f} imports ${spec}`,
        );
        assert.doesNotMatch(spec, /hostChannel|webview|vscode|node:/);
      }
    }
  });

  void it('thrown Error and RangeError messages are string literals without interpolation', () => {
    const offenders: string[] = [];
    for (const f of gameFiles) {
      for (const m of code(f).matchAll(/new\s+(?:Range|Type)?Error\s*\(\s*([^)]*)\)/g)) {
        const arg = (m[1] ?? '').trim();
        if (!/^(['"])[^'"`$]*\1$/.test(arg)) {
          offenders.push(`${f}: ${arg}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  void it('every switch on .state, .phase, .kind, or .type ends in assertNever', () => {
    let found = 0;
    for (const f of gameFiles) {
      const src = code(f);
      for (const m of src.matchAll(/\bswitch\s*\(([^)]*)\)\s*\{/g)) {
        const disc = (m[1] ?? '').trim();
        if (
          !/(\.(state|phase|kind|type)|lifecycle|kind)$/.test(disc) &&
          !/^this\.#(phase|lifecycle)$/.test(disc)
        ) {
          continue;
        }
        found += 1;
        const body = blockAt(src, (m.index ?? 0) + m[0].length - 1);
        assert.match(body, /\bdefault\s*:[\s\S]*\bassertNever\s*\(/, `${f}: switch (${disc})`);
      }
    }
    assert.ok(found >= 5, `found ${found}`);
  });

  void it('the update loop is wrapped in try/catch with onError (Game.step, frame, render)', () => {
    const src = code('src/game/Game.ts');
    assert.ok((src.match(/\btry\s*\{/g) ?? []).length >= 5);
    assert.match(
      src,
      /catch\s*\(\s*error\s*:\s*unknown\s*\)\s*\{\s*this\.#sink\(error,\s*'step'\)/,
    );
    assert.match(src, /this\.#sink\(error,\s*'render'\)/);
  });
});

void describe('webview glue (invariants 3, 4)', () => {
  void it('sceneFeed.ts and gameHost.ts are DOM-free and never touch the host channel', () => {
    for (const f of [
      'src/webview/sceneFeed.ts',
      'src/webview/gameHost.ts',
      'src/webview/progressSaver.ts',
    ]) {
      const src = code(f);
      assert.doesNotMatch(
        src,
        /\b(window|document|globalThis|acquireVsCodeApi|postMessage|requestAnimationFrame)\b/,
        f,
      );
      assert.doesNotMatch(src, /hostChannel|\.send\s*\(/, f);
    }
  });

  void it('channel.send is called only in main.ts: once with ready, once with a message built by createSaveProgressMessage (E1)', () => {
    const sends = listFiles('src/webview')
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) => [...code(f).matchAll(/\.send\s*\(([^)]*)\)/g)].map((m) => `${f}: ${m[1]}`));
    assert.equal(sends.length, 2, sends.join('\n'));
    // Source order: the saver closure (defined first in main.ts) and then the boot-time ready.
    assert.deepEqual(
      [...sends].sort(),
      ['src/webview/main.ts: message', "src/webview/main.ts: { type: 'ready' }"].sort(),
    );
    const main = code('src/webview/main.ts');
    // The second send's argument can only come from the validating creator, inside the saver closure.
    assert.match(
      main,
      /new ProgressSaver\(\s*\(progress\)\s*=>\s*\{\s*const message = createSaveProgressMessage\(progress\);\s*if \(message !== undefined\) \{\s*channel\?\.send\(message\);/,
    );
    assert.equal((main.match(/createSaveProgressMessage\(/g) ?? []).length, 1);
    // The literal 'saveProgress' is never written by hand in the webview.
    for (const f of listFiles('src/webview').filter((x) => x.endsWith('.ts'))) {
      assert.doesNotMatch(code(f), /type:\s*'saveProgress'/, f);
    }
    // The saver and the feed never see the channel.
    for (const f of ['src/webview/progressSaver.ts', 'src/webview/sceneFeed.ts']) {
      assert.doesNotMatch(code(f), /\bHostChannel\b|hostChannel|\.send\s*\(|\bchannel\b/, f);
    }
    assert.deepEqual(
      filesMatching(gameFiles, /\.send\s*\(|\bHostChannel\b|\bcreateHostChannel\b/),
      [],
    );
  });

  void it('GameHost schedules the next frame before it calls game.frame', () => {
    const src = code('src/webview/gameHost.ts');
    const body = blockAt(src, src.indexOf('{', src.indexOf('readonly #onFrame')));
    assert.ok(body.indexOf('this.#schedule()') >= 0);
    assert.ok(body.indexOf('this.#schedule()') < body.indexOf('game.frame('));
  });

  void it('canvasSurface.ts and main.ts are the only webview files that name the DOM', () => {
    const offenders = listFiles('src/webview')
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /\b(document|HTMLCanvasElement|CanvasRenderingContext2D)\b/.test(code(f)))
      .sort();
    assert.deepEqual(offenders, ['src/webview/canvasSurface.ts', 'src/webview/main.ts']);
  });
});

void describe('art files carry characters only (invariant 5; M4 plan note 13)', () => {
  const templateFiles = listFiles('src/game/sprites').filter((f) => /Templates\.ts$/.test(f));

  void it('template files exist', () => {
    assert.ok(templateFiles.length >= 3, templateFiles.join());
  });

  void it('no hex colour or data URI in any template file', () => {
    for (const f of templateFiles) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:/, f);
    }
  });

  void it('no image, audio, or font file anywhere under src/', () => {
    const assets = listFiles('src').filter((f) =>
      /\.(png|jpe?g|gif|webp|svg|ico|wav|mp3|ogg|woff2?|ttf|otf)$/i.test(f),
    );
    assert.deepEqual(assets, []);
  });
});
