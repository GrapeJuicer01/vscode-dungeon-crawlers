// src/host/gameConfig.ts (E1 plan section 3.2, test note 3): the three game settings are read
// totally. A wrong type falls back to the default, an integer is rounded and clamped, a throwing
// getter never escapes. The values also match package.json.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ENEMIES_ENABLED,
  DEFAULT_KILLS_PER_STAGE,
  DEFAULT_MAX_ENEMIES,
  GAME_SETTINGS_SECTION,
  readGameSettings,
} from '../../src/host/gameConfig';
import {
  MAX_KILLS_PER_STAGE,
  MAX_MAX_ENEMIES,
  MIN_KILLS_PER_STAGE,
  MIN_MAX_ENEMIES,
} from '../../src/shared/protocol';
import { asRecord, readJson } from '../support/repo';

function from(values: Record<string, unknown>): ReturnType<typeof readGameSettings> {
  return readGameSettings((key) => values[key]);
}

void describe('readGameSettings', () => {
  void it('uses the section name pixelAgents and the documented defaults', () => {
    assert.equal(GAME_SETTINGS_SECTION, 'pixelAgents');
    assert.deepEqual(from({}), { enemiesEnabled: true, killsPerStage: 30, maxEnemies: 6 });
    assert.equal(DEFAULT_ENEMIES_ENABLED, true);
    assert.equal(DEFAULT_KILLS_PER_STAGE, 30);
    assert.equal(DEFAULT_MAX_ENEMIES, 6);
  });

  void it('passes the bare key (no section prefix) to the getter', () => {
    const asked: string[] = [];
    readGameSettings((key) => {
      asked.push(key);
      return undefined;
    });
    assert.deepEqual(asked.sort(), ['enemies', 'killsPerStage', 'maxEnemies']);
  });

  void it('reads valid values as given', () => {
    assert.deepEqual(from({ enemies: false, killsPerStage: 12, maxEnemies: 3 }), {
      enemiesEnabled: false,
      killsPerStage: 12,
      maxEnemies: 3,
    });
  });

  void it('clamps integers to the documented ranges', () => {
    assert.equal(MIN_KILLS_PER_STAGE, 5);
    assert.equal(MAX_KILLS_PER_STAGE, 500);
    assert.equal(MIN_MAX_ENEMIES, 1);
    assert.equal(MAX_MAX_ENEMIES, 12);
    assert.equal(from({ killsPerStage: 1 }).killsPerStage, 5);
    assert.equal(from({ killsPerStage: 0 }).killsPerStage, 5);
    assert.equal(from({ killsPerStage: -50 }).killsPerStage, 5);
    assert.equal(from({ killsPerStage: 10_000 }).killsPerStage, 500);
    assert.equal(from({ maxEnemies: 0 }).maxEnemies, 1);
    assert.equal(from({ maxEnemies: 99 }).maxEnemies, 12);
  });

  void it('rounds non-integers', () => {
    assert.equal(from({ killsPerStage: 29.6 }).killsPerStage, 30);
    assert.equal(from({ maxEnemies: 2.4 }).maxEnemies, 2);
  });

  void it('falls back to the default for the wrong type or a non-finite number', () => {
    for (const bad of ['30', null, undefined, {}, [], true, Number.NaN]) {
      assert.equal(
        from({ killsPerStage: bad }).killsPerStage,
        30,
        JSON.stringify(bad) ?? 'undefined',
      );
      assert.equal(from({ maxEnemies: bad }).maxEnemies, 6, JSON.stringify(bad) ?? 'undefined');
    }
    assert.equal(from({ killsPerStage: Number.POSITIVE_INFINITY }).killsPerStage, 30);
    for (const bad of ['false', 0, 1, null, undefined, {}]) {
      assert.equal(from({ enemies: bad }).enemiesEnabled, true, JSON.stringify(bad) ?? 'undefined');
    }
  });

  void it('a throwing getter never escapes and yields the default for that key', () => {
    const settings = readGameSettings((key) => {
      if (key === 'killsPerStage') {
        throw new Error('settings broke');
      }
      return key === 'enemies' ? false : 4;
    });
    assert.deepEqual(settings, { enemiesEnabled: false, killsPerStage: 30, maxEnemies: 4 });
    assert.doesNotThrow(() =>
      readGameSettings(() => {
        throw new Error('all broke');
      }),
    );
  });

  void it('returns a new object each call', () => {
    assert.notEqual(from({}), from({}));
  });
});

void describe('game settings match package.json contributes.configuration', () => {
  const manifest = asRecord(readJson('package.json'), 'package.json');
  const properties = asRecord(
    asRecord(asRecord(manifest.contributes, 'contributes').configuration, 'configuration')
      .properties,
    'properties',
  );

  void it('pixelAgents.enemies is a boolean defaulting to true, window scope', () => {
    const property = asRecord(properties['pixelAgents.enemies'], 'enemies');
    assert.equal(property.type, 'boolean');
    assert.equal(property.default, DEFAULT_ENEMIES_ENABLED);
    assert.equal(property.scope, 'window');
    assert.ok(String(property.markdownDescription).length > 20);
  });

  void it('pixelAgents.killsPerStage is an integer 5..500 defaulting to 30, window scope', () => {
    const property = asRecord(properties['pixelAgents.killsPerStage'], 'killsPerStage');
    assert.equal(property.type, 'integer');
    assert.equal(property.default, DEFAULT_KILLS_PER_STAGE);
    assert.equal(property.minimum, MIN_KILLS_PER_STAGE);
    assert.equal(property.maximum, MAX_KILLS_PER_STAGE);
    assert.equal(property.scope, 'window');
    assert.ok(String(property.markdownDescription).length > 20);
  });

  void it('pixelAgents.maxEnemies is an integer 1..12 defaulting to 6, window scope', () => {
    const property = asRecord(properties['pixelAgents.maxEnemies'], 'maxEnemies');
    assert.equal(property.type, 'integer');
    assert.equal(property.default, DEFAULT_MAX_ENEMIES);
    assert.equal(property.minimum, MIN_MAX_ENEMIES);
    assert.equal(property.maximum, MAX_MAX_ENEMIES);
    assert.equal(property.scope, 'window');
    assert.ok(String(property.markdownDescription).length > 20);
  });
});
