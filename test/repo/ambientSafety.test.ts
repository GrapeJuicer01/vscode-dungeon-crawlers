// Lava and ambient safety, structural half (E3 plan section 7, note 7a): nothing in src reads lava,
// an ember, or a firefly as game state. Stage decoration is data plus particles; the hero side and
// the combat side never mention it, and Ambience.ts is the only reader of `ambient.kind`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENEMY_SIDE } from '../support/sides';
import { listFiles, readText } from '../support/repo';
import { code, srcFiles } from '../support/source';

const gameFiles = srcFiles().filter((f) => f.startsWith('src/game/'));

/** Files that legitimately carry stage decoration: art, stage rows, the ambient emitter, the pool. */
const DECORATION = new Set([
  'src/game/Ambience.ts',
  'src/game/Particles.ts',
  'src/game/Renderer.ts',
  'src/game/data/stages.ts',
  'src/game/data/tuning.ts',
  'src/game/entities/Campfire.ts',
  'src/game/sprites/spriteValidator.ts',
  'src/game/sprites/palettes.ts',
  'src/game/sprites/palettesE1.ts',
  'src/game/sprites/palettesE3.ts',
  'src/game/sprites/stage5Templates.ts',
  'src/game/sprites/stage6Templates.ts',
  'src/game/sprites/enemiesStage5.ts',
  'src/game/sprites/enemiesStage6.ts',
  'src/game/sprites/elderDryadTemplate.ts',
  'src/game/sprites/moltenColossusTemplate.ts',
  'src/game/sprites/enemyTemplates.ts',
  'src/game/sprites/spriteTemplates.ts',
  'src/game/data/enemies.ts',
]);

/** Identifiers of the E3 decoration: lava, fireflies, stage embers, and the Stage 5/6 prop names. */
const DECORATION_WORDS =
  /lava|firefl|\bembers\b|STAGE_EMBER|glowBloom|ruinedStatue|obsidianPillar|\banvil\b|slagHeap|toolRack|hangingRoots|brokenPillar|fernPatch|flowerBed/i;

void describe('lava, embers, and fireflies are never game state (invariants 1 and 2)', () => {
  void it('the hero side and the combat side name none of the E3 decoration identifiers', () => {
    const scanned = gameFiles.filter((f) => !DECORATION.has(f));
    assert.ok(scanned.length > 20, `${scanned.length} files scanned`);
    for (const f of scanned) {
      const hit = DECORATION_WORDS.exec(readText(f));
      assert.equal(hit, null, `${f}: ${hit?.[0]}`);
    }
    for (const f of ENEMY_SIDE.filter((x) => x !== 'src/game/data/enemies.ts')) {
      const hit = DECORATION_WORDS.exec(readText(f));
      assert.equal(hit, null, `${f}: ${hit?.[0]}`);
    }
  });

  void it('the enemy table names embers only inside the Ember Imp row', () => {
    const stripped = code('src/game/data/enemies.ts').replace(/ember-imp|Ember Imp/g, '');
    assert.doesNotMatch(stripped, /lava|firefl|ember/i);
  });

  void it('nothing outside src/game and the webview boot reads ambient or particle kinds (host, monitor, shared, webview)', () => {
    for (const f of srcFiles().filter((x) => !x.startsWith('src/game/'))) {
      assert.doesNotMatch(code(f), /\b(fireflies|firefly|lava\w*|AmbientEffect)\b/, f);
    }
  });

  void it('Ambience.ts is the only reader of the ambient kind', () => {
    const readers = gameFiles.filter((f) =>
      /\.ambient\b|\bambient\.kind\b|effect\.kind\b/.test(code(f)),
    );
    assert.deepEqual(readers, ['src/game/Ambience.ts']);
  });

  void it('Ambience.ts never touches a hero, a roster, a combat object, or the progress: it reads the stage and emits particles', () => {
    const src = code('src/game/Ambience.ts');
    assert.doesNotMatch(
      src,
      /\b(Hero|ClassHero|Roster|Combat|Enemy|Boss|Progression|lifecycle|heroes)\b/,
    );
    const emits = [...src.matchAll(/particles\.emit\(\s*'(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(emits)].sort(), [
      'bubble',
      'drip',
      'ember',
      'firefly',
      'mote',
      'wisp',
    ]);
  });

  void it('Particles.ts holds no reference to heroes or combat: a particle is position, velocity, age, and kind', () => {
    const src = code('src/game/Particles.ts');
    assert.doesNotMatch(src, /\b(Hero|Roster|Combat|Enemy|Boss|Progression|lifecycle)\b/);
  });

  void it('no E3 decoration file imports a hero or combat module', () => {
    for (const f of ['src/game/Ambience.ts', 'src/game/Particles.ts']) {
      const imports = [...code(f).matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const spec of imports) {
        assert.doesNotMatch(
          spec,
          /Hero|Roster|Combat|Enemy|Boss|Progression|StageDirector|Engagement/,
          `${f}: ${spec}`,
        );
      }
    }
  });

  void it('the src tree has no file named for lava, ember, or firefly state', () => {
    assert.deepEqual(
      listFiles('src').filter((f) => /lava|firefl|embers/i.test(f)),
      [],
    );
  });
});
