// Stage data validation and building (M4 plan test note 5, data model section 4).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STAGES } from '../../src/game/data/stages';
import type { PropPlacement, StageDef } from '../../src/game/data/stages';
import { buildStage, validateStages } from '../../src/game/Stage';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import { FakeBitmap, FakeBitmaps } from '../support/engineFakes';

const def = STAGES[0] as StageDef;

function withProps(
  extra: readonly PropPlacement[],
  drop: (p: PropPlacement) => boolean = () => false,
): StageDef {
  return { ...def, props: [...def.props.filter((p) => !drop(p)), ...extra] };
}

function floorProp(
  prop: string,
  zone: PropPlacement['zone'],
  x: number,
  y: number,
  solid: PropPlacement['solid'],
): PropPlacement {
  return { prop, zone, layer: 'floor', x, y, solid, light: null };
}

function errorsFor(stage: StageDef): readonly string[] {
  return validateStages([stage], SHIPPED_ART);
}

void describe('validateStages', () => {
  void it('accepts Stage 1', () => {
    assert.deepEqual(validateStages(STAGES, SHIPPED_ART), []);
    assert.equal(def.id, 'forgotten-cellar');
    assert.equal(def.index, 1);
  });

  void it('rejects a solid prop in the door zone', () => {
    const bad = withProps(
      [
        {
          prop: 'doorFrame',
          zone: 'door',
          layer: 'wall',
          x: 0,
          y: 0,
          solid: { w: 8, h: 4 },
          light: null,
        },
      ],
      (p) => p.zone === 'door',
    );
    assert.match(
      errorsFor(bad).join('\n'),
      /in the door zone must be a non-solid wall prop at x 0/,
    );
  });

  void it('rejects a door-zone prop that is not at x 0, is a floor prop, or is wider than a tile', () => {
    const at = (x: number, layer: 'wall' | 'floor', prop = 'doorFrame', y = 0): StageDef =>
      withProps(
        [{ prop, zone: 'door', layer, x, y, solid: null, light: null }],
        (p) => p.zone === 'door',
      );
    assert.notDeepEqual(errorsFor(at(4, 'wall')), []);
    assert.notDeepEqual(errorsFor(at(0, 'floor', 'doorFrame', 140)), []);
  });

  void it('rejects a solid prop in the corridor (solids are alcove floor props only)', () => {
    const bad = withProps([floorProp('barrel', 'corridor', 100, 150, { w: 12, h: 5 })]);
    assert.match(errorsFor(bad).join('\n'), /solid barrel must be an alcove floor prop/);
  });

  void it('rejects a solid wall prop', () => {
    const bad = withProps([
      {
        prop: 'chains',
        zone: 'alcove',
        layer: 'wall',
        x: 60,
        y: 16,
        solid: { w: 4, h: 4 },
        light: null,
      },
    ]);
    assert.match(errorsFor(bad).join('\n'), /solid chains must be an alcove floor prop/);
  });

  void it('rejects props outside their zone bounds', () => {
    assert.match(
      errorsFor(withProps([floorProp('bonePile', 'alcove', 125, 152, null)])).join('\n'),
      /bonePile is outside the alcove/,
    );
    assert.match(
      errorsFor(withProps([floorProp('bonePile', 'alcove', -1, 152, null)])).join('\n'),
      /outside the alcove/,
    );
    assert.match(
      errorsFor(withProps([floorProp('bonePile', 'corridor', 380, 152, null)])).join('\n'),
      /outside the corridor/,
    );
  });

  void it('rejects a wall prop outside the wall rows and a floor prop outside the floor band', () => {
    const wallTooLow = withProps([
      { prop: 'chains', zone: 'alcove', layer: 'wall', x: 60, y: 120, solid: null, light: null },
    ]);
    assert.match(errorsFor(wallTooLow).join('\n'), /wall prop chains is outside the wall rows/);
    assert.match(
      errorsFor(withProps([floorProp('bonePile', 'alcove', 20, 120, null)])).join('\n'),
      /floor prop bonePile foot is outside the floor band/,
    );
    assert.match(
      errorsFor(withProps([floorProp('bonePile', 'alcove', 20, 160, null)])).join('\n'),
      /outside the floor band/,
    );
  });

  void it('rejects an unknown prop key', () => {
    assert.match(
      errorsFor(withProps([floorProp('dragon', 'alcove', 20, 150, null)])).join('\n'),
      /unknown prop dragon/,
    );
  });

  void it('rejects a stage with no door frame, or two', () => {
    const none = withProps([], (p) => p.zone === 'door');
    assert.match(errorsFor(none).join('\n'), /expected exactly one door-zone prop, found 0/);
    const two = withProps([
      { prop: 'doorFrame', zone: 'door', layer: 'wall', x: 0, y: 0, solid: null, light: null },
    ]);
    assert.match(errorsFor(two).join('\n'), /expected exactly one door-zone prop, found 2/);
  });

  void it('accepts light radii 8 and 96 and rejects 7.9, 96.1, NaN, a bad intensity, and an unknown colour', () => {
    const lit = (radius: number, intensity = 0.8, colorChar = 'T'): StageDef =>
      withProps(
        [
          {
            prop: 'torch',
            zone: 'alcove',
            layer: 'wall',
            x: 60,
            y: 40,
            solid: null,
            light: { radius, intensity, colorChar, flicker: true },
          },
        ],
        (p) => p.zone === 'alcove' && p.prop === 'torch',
      );
    assert.deepEqual(errorsFor(lit(8)), []);
    assert.deepEqual(errorsFor(lit(96)), []);
    for (const radius of [7.9, 96.1, 0, -4, 200, NaN]) {
      assert.match(
        errorsFor(lit(radius)).join('\n'),
        /light on torch is out of range/,
        String(radius),
      );
    }
    assert.match(errorsFor(lit(40, 1.5)).join('\n'), /out of range/);
    assert.match(errorsFor(lit(40, -0.1)).join('\n'), /out of range/);
    assert.match(errorsFor(lit(40, 0.5, 'Z')).join('\n'), /out of range/);
  });

  void it('rejects more than 8 lights', () => {
    const torches: PropPlacement[] = Array.from({ length: 6 }, (_, i) => ({
      prop: 'torch',
      zone: 'corridor' as const,
      layer: 'wall' as const,
      x: 20 + i * 50,
      y: 40,
      solid: null,
      light: { radius: 40, intensity: 0.5, colorChar: 'T', flicker: false },
    }));
    assert.match(errorsFor(withProps(torches)).join('\n'), /more than 8 lights/);
  });

  void it('rejects a solid that blocks a seat or the route to it (connectivity)', () => {
    // A wide solid across the whole alcove floor band, away from nothing: every seat is blocked.
    const wall = withProps([floorProp('crate', 'alcove', 56, 158, { w: 100, h: 30 })]);
    const text = errorsFor(wall).join('\n');
    assert.match(
      text,
      /(seat|formation slot) \d+ is (on a blocked cell|unreachable from the door)|footprint leaves the floor band/,
    );
  });

  void it('rejects a solid footprint that leaves the floor band', () => {
    const bad = withProps([floorProp('barrel', 'alcove', 10, 134, { w: 12, h: 30 })]);
    assert.match(errorsFor(bad).join('\n'), /footprint leaves the floor band/);
  });

  void it('rejects bad ids, duplicates, and non-contiguous indexes', () => {
    assert.match(errorsFor({ ...def, id: 'Forgotten Cellar' }).join('\n'), /id is not kebab-case/);
    assert.match(
      validateStages([def, { ...def, index: 2 }], SHIPPED_ART).join('\n'),
      /duplicate id/,
    );
    assert.match(errorsFor({ ...def, index: 3 }).join('\n'), /index is not contiguous/);
    assert.match(errorsFor({ ...def, id: 'no-such-stage' }).join('\n'), /no stage art/);
  });

  void it('error text names stages and props only: fixed strings, no pixels or user data', () => {
    for (const error of errorsFor(withProps([floorProp('dragon', 'alcove', 20, 150, null)]))) {
      assert.match(error, /^stage 1: /);
    }
  });
});

function build(record: boolean): {
  stage: ReturnType<typeof buildStage>;
  bitmaps: FakeBitmaps;
  cache: SpriteCache;
} {
  const bitmaps = new FakeBitmaps();
  bitmaps.recordOffscreen = record;
  const cache = new SpriteCache(bitmaps, SHIPPED_ART);
  return { stage: buildStage(def, SHIPPED_ART, cache, bitmaps), bitmaps, cache };
}

void describe('buildStage', () => {
  const { stage } = build(false);

  void it('makes strips of the planned sizes', () => {
    const size = (b: { width: number; height: number }): string => `${b.width}x${b.height}`;
    assert.equal(size(stage.alcoveStrip), '128x180');
    assert.equal(size(stage.doorStrip), '16x180');
    assert.equal(size(stage.corridorStrip), '384x180');
    assert.equal(size(stage.nearForeground), '144x20');
    assert.equal(size(stage.corridorForeground), '384x20');
    assert.equal(size(stage.backdrop.frames[0] as FakeBitmap), '128x128');
  });

  void it('positions lights from the torch placements (centre x, near the flame)', () => {
    const torches = def.props.filter((p) => p.prop === 'torch');
    assert.equal(stage.lights.length, torches.length);
    assert.ok(torches.length >= 2);
    const sheetW = 8;
    for (const torch of torches) {
      const light = stage.lights.find(
        (l) => l.zone === torch.zone && l.light.x === torch.x + sheetW / 2,
      );
      assert.ok(light, `torch at ${torch.zone} ${torch.x}`);
      assert.equal(light.light.radius, torch.light?.radius);
      assert.equal(light.light.y, torch.y + 6);
      assert.equal(light.flicker, true);
    }
  });

  void it('draws multi-frame props live (torches, ripples) and bakes static ones into the strips', () => {
    const sprites = SHIPPED_ART.stageSprites[def.id];
    const animated = def.props.filter(
      (p) => p.solid === null && (sprites?.props[p.prop]?.animations['idle']?.length ?? 0) > 1,
    );
    assert.equal(stage.livePropsBehind.length, animated.length);
    assert.ok(animated.filter((p) => p.prop === 'torch').length >= 2);
    assert.ok(stage.livePropsBehind.every((p) => p.sheet.frames.length > 1));
  });

  void it('solid props block the nav grid and sort with heroes', () => {
    assert.equal(stage.solidProps.length, def.props.filter((p) => p.solid !== null).length);
    const barrel = def.props.find((p) => p.prop === 'barrel');
    assert.ok(barrel?.solid);
    // The barrel's foot cell is blocked.
    const cell = stage.nav.cellAt(barrel.x + 8, barrel.y - 1);
    assert.equal(stage.nav.blocked[cell], 1);
    // An open floor cell in front of the entrance is not.
    assert.equal(stage.nav.blocked[stage.nav.cellAt(136, 146)], 0);
    for (const solid of stage.solidProps) {
      assert.ok(solid.sortY >= 128 && solid.sortY < 160);
    }
  });

  void it('puts a drip point at every puddle', () => {
    assert.equal(stage.dripPoints.length, def.props.filter((p) => p.prop === 'puddle').length);
  });

  void it('takes the clear colour and ambient character from the art', () => {
    const clear = SHIPPED_ART.stageClearChar[def.id] ?? '';
    assert.equal(stage.clearColor, SHIPPED_ART.palette[clear]);
    assert.equal(stage.ambientChar, SHIPPED_ART.stageAmbientChar[def.id]);
  });

  void it('throws a fixed RangeError when stage art is missing', () => {
    const bitmaps = new FakeBitmaps();
    assert.throws(
      () =>
        buildStage(
          { ...def, id: 'missing' },
          SHIPPED_ART,
          new SpriteCache(bitmaps, SHIPPED_ART),
          bitmaps,
        ),
      /^RangeError: Stage art is missing$/,
    );
  });

  void it('throws a fixed RangeError for a placement whose prop has no art', () => {
    const bitmaps = new FakeBitmaps();
    assert.throws(
      () =>
        buildStage(
          withProps([floorProp('dragon', 'alcove', 20, 150, null)]),
          SHIPPED_ART,
          new SpriteCache(bitmaps, SHIPPED_ART),
          bitmaps,
        ),
      /^RangeError: Stage prop is missing$/,
    );
  });
});

/** The strip draws as comparable text (bitmaps replaced by their pixel checksum and size). */
function stripLog(bitmaps: FakeBitmaps): string {
  const checksum = (b: FakeBitmap): string => {
    let h = 0;
    for (const v of b.rgba ?? []) {
      h = (Math.imul(h, 31) + v) >>> 0;
    }
    return `${b.width}x${b.height}:${h}`;
  };
  return JSON.stringify(
    bitmaps.offscreens.map((o) =>
      o.surface.calls.map((c) => [
        c.method,
        ...c.args.map((a) => (a instanceof FakeBitmap ? checksum(a) : a)),
      ]),
    ),
  );
}

void describe('tile variants are deterministic', () => {
  void it('two builds paint identical strips', () => {
    assert.equal(stripLog(build(true).bitmaps), stripLog(build(true).bitmaps));
  });
});

void describe('Stage 1 barred windows', () => {
  const { bitmaps, cache } = build(true);
  const sprites = SHIPPED_ART.stageSprites[def.id];
  assert.ok(sprites);
  const windowBitmaps = new Set<unknown>(
    sprites.tiles.wallMid
      .filter((t) => (t.animations['idle']?.[0] ?? []).some((row) => row.includes('.')))
      .map((t) => cache.sheet(t).frames[0]),
  );
  const solidWalls = new Set<unknown>(
    sprites.tiles.wallMid
      .filter((t) => !(t.animations['idle']?.[0] ?? []).some((row) => row.includes('.')))
      .map((t) => cache.sheet(t).frames[0]),
  );
  // Offscreen order in buildStage: alcove, door, corridor strips, then two foregrounds.
  const zones = [
    { name: 'alcove', surface: bitmaps.offscreens[0], cols: 8 },
    { name: 'door', surface: bitmaps.offscreens[1], cols: 1 },
    { name: 'corridor', surface: bitmaps.offscreens[2], cols: 24 },
  ];

  /** Wall-mid tile draws by [col, row] for one zone. */
  function wallMidDraws(
    surface: (typeof zones)[number]['surface'],
  ): { col: number; row: number; window: boolean }[] {
    const draws: { col: number; row: number; window: boolean }[] = [];
    for (const call of surface?.surface.calls ?? []) {
      if (call.method !== 'drawBitmap') continue;
      const bitmap = call.args[0];
      const isWindow = windowBitmaps.has(bitmap);
      const isSolidWall = solidWalls.has(bitmap);
      if (!isWindow && !isSolidWall) continue;
      const x = Number(call.args[1]);
      const y = Number(call.args[2]);
      if (y >= 16 && y <= 96 && x % 16 === 0 && y % 16 === 0) {
        draws.push({ col: x / 16, row: y / 16, window: isWindow });
      }
    }
    return draws;
  }

  void it('draws every wall-mid cell of every zone (rows 1 to 6)', () => {
    for (const zone of zones) {
      assert.equal(wallMidDraws(zone.surface).length, zone.cols * 6, zone.name);
    }
  });

  void it('puts windows only in wall row 3, never in the first or last column of a zone', () => {
    let total = 0;
    for (const zone of zones) {
      for (const d of wallMidDraws(zone.surface).filter((x) => x.window)) {
        total++;
        assert.equal(d.row, 3, `${zone.name} window at row ${d.row}`);
        assert.ok(
          d.col > 0 && d.col < zone.cols - 1,
          `${zone.name} window in edge column ${d.col}`,
        );
      }
    }
    assert.ok(total > 0, 'the artist-made window variant is used');
  });

  void it('never places two windows next to each other', () => {
    for (const zone of zones) {
      const cols = wallMidDraws(zone.surface)
        .filter((d) => d.window)
        .map((d) => d.col)
        .sort((a, b) => a - b);
      for (let i = 1; i < cols.length; i++) {
        assert.ok((cols[i] ?? 0) - (cols[i - 1] ?? 0) > 1, `${zone.name}: ${cols.join(',')}`);
      }
    }
  });

  void it('appear for about one cell in six of the corridor (rare, but present)', () => {
    const corridor = wallMidDraws(zones[2]?.surface).filter((d) => d.window).length;
    // 22 candidate columns at 1 in 6 is about 3.7; the no-neighbour rule lowers it slightly.
    assert.ok(corridor >= 1 && corridor <= 8, `${corridor} windows in 22 candidates`);
    assert.ok(wallMidDraws(zones[0]?.surface).filter((d) => d.window).length <= 3);
  });

  void it('the door column never has one', () => {
    assert.equal(wallMidDraws(zones[1]?.surface).filter((d) => d.window).length, 0);
  });
});
