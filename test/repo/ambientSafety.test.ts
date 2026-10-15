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
  // E4 (plan section 7, note 7a): Stage 7 and 8 art. Absent files are simply not scanned.
  'src/game/sprites/stage7Templates.ts',
  'src/game/sprites/stage8Templates.ts',
  'src/game/sprites/enemiesStage7.ts',
  'src/game/sprites/enemiesStage8.ts',
  'src/game/sprites/glacierMammothTemplate.ts',
  'src/game/sprites/eclipseWardenTemplate.ts',
  'src/game/sprites/palettesE4.ts',
  // E5 (plan section 7, note 7a): Stage 9 and 10 art. Absent files are simply not scanned.
  'src/game/sprites/stage9Templates.ts',
  'src/game/sprites/stage10Templates.ts',
  'src/game/sprites/enemiesStage9.ts',
  'src/game/sprites/enemiesStage10.ts',
  'src/game/sprites/hoardDragonTemplate.ts',
  'src/game/sprites/voidSovereignTemplate.ts',
  'src/game/sprites/palettesE5.ts',
  'src/game/sprites/enemyTemplates.ts',
  'src/game/sprites/spriteTemplates.ts',
  'src/game/data/enemies.ts',
]);

/**
 * Identifiers of the E3 to E5 decoration: lava, fireflies, stage embers, snow, murk, heat shimmer,
 * void rifts, and the Stage 5 to 10 prop names. The bare words frozen, shadow, mirror, and shard are
 * deliberately absent: they collide with Entity.frozen, the drawn flat shadow, and the host-state
 * mirror in Game.ts. For E5 the bare words void (the TypeScript operator), star, ring, spire, gold,
 * dragon, hoard, and drift (SNOW_DRIFT, FIREFLY_DRIFT, hero drift) are absent for the same reason;
 * \brifts?\b is safe because there is no word boundary inside "drift".
 */
const DECORATION_WORDS =
  /lava|firefl|\bembers\b|STAGE_EMBER|glowBloom|ruinedStatue|obsidianPillar|\banvil\b|slagHeap|toolRack|hangingRoots|brokenPillar|fernPatch|flowerBed|\bsnow\b|snowfall|\bmurk\b|SNOW_|MURK_|frozen-citadel|shadow-realm|icePillar|icicleCluster|frostBanner|iceLamp|iceSheet|iceThrone|snowDrift|duskPillar|floatingShard|mirrorFrame|wispTorch|duskAltar|shardPatch|\bshimmer\b|SHIMMER_|\brifts?\b|RIFT_|dragons-lair|void-spire|scorchedPillar|drakeSkull|hoardBrazier|goldVein|scaleBanner|hoardPile|goldScatter|spirePillar|voidRift|starWindow|orbitRing|riftPedestal|crackedSlab/i;

void describe('lava, embers, and fireflies are never game state (invariants 1 and 2)', () => {
  void it('the hero side and the combat side name none of the E3 to E5 decoration identifiers', () => {
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

  void it('the enemy table names snow, murk, frost, ice, and glacier scenery only inside the ten E4 rows', () => {
    const E4_NAMES = [
      'rime-penguin|Rime Penguin',
      'frost-hare|Frost Hare',
      'snow-sentry|Snow Sentry',
      'snow-yeti|Snow Yeti',
      'glacier-mammoth|Glacier Mammoth',
      'lantern-wraith|Lantern Wraith',
      'shard-cluster|Shard Cluster',
      'mirror-mimic|Mirror Mimic',
      'gloom-stag|Gloom Stag',
      'eclipse-warden|Eclipse Warden',
    ].join('|');
    const original = code('src/game/data/enemies.ts');
    assert.match(original, /rime-penguin/, 'the strip has something to remove');
    const stripped = original.replace(new RegExp(E4_NAMES, 'g'), '');
    assert.doesNotMatch(stripped, /\b(snow|murk|frost|ice|glacier)\b/i);
  });

  void it('the enemy table names shimmer, rift, spire, and brazier scenery only inside the ten E5 rows', () => {
    // hoard-dragon contains "hoard" and void-sovereign contains "void"; the rows are removed first.
    // Until the E5 rows exist the strip is a no-op and the scenery scan still holds.
    const E5_NAMES =
      /hoard-dragon|Hoard Dragon|void-sovereign|Void Sovereign|drake-whelp|Drake Whelp|kobold-sapper|Kobold Sapper|gilded-crown|Gilded Crown|crescent-drifter|Crescent Drifter|comet-tadpole|Comet Tadpole|eye-strider|Eye Strider|ash-wyvern|Ash Wyvern|obelisk-sentinel|Obelisk Sentinel/g;
    const stripped = code('src/game/data/enemies.ts').replace(E5_NAMES, '');
    assert.doesNotMatch(stripped, /shimmer|\brifts?\b|spire|brazier/i);
  });

  void it('nothing outside src/game and the webview boot reads ambient or particle kinds (host, monitor, shared, webview)', () => {
    for (const f of srcFiles().filter((x) => !x.startsWith('src/game/'))) {
      assert.doesNotMatch(code(f), /\b(fireflies|firefly|lava\w*|AmbientEffect)\b/, f);
      assert.doesNotMatch(code(f), /\b(snow|snowfall|murk)\b|frozen-citadel|shadow-realm/i, f);
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
      'murk',
      'rift',
      'shimmer',
      'snow',
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

  void it('the src tree has no file named for lava, ember, firefly, snow, or murk state', () => {
    assert.deepEqual(
      listFiles('src').filter((f) => /lava|firefl|embers|snow|murk/i.test(f)),
      [],
    );
  });
});
