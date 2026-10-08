// Builds a StageRuntime from a StageDef plus art: pre-rendered environment strips, the navigation
// grid, light sources, live props, and drip points. Also validates stage data at startup
// (docs/architecture/data-model.md section 4). Deterministic: tile variants come from a hash of
// the tile cell and the stage index, so the picture is identical on every load.
import type { Aabb } from './Collision';
import { PROP_FRAME_MS, TORCH_FRAME_MS } from './data/animations';
import type { StageDef, StageZone } from './data/stages';
import { Prop } from './entities/Prop';
import type { Entity } from './entities/Entity';
import {
  ALCOVE_WIDTH,
  CAMPFIRE_FOOT_Y,
  CAMPFIRE_X,
  CORRIDOR_SEGMENT_PX,
  FLOOR_Y,
  FOREGROUND_Y,
  INTERNAL_HEIGHT,
  NAV_CELL_PX,
  NAV_COLS,
  NAV_ROWS,
  TILE,
  VISIBLE_SLOTS,
  entrancePosition,
  formationPosition,
  seatPosition,
} from './layout';
import type { Point } from './layout';
import type { LightSource } from './Lighting';
import { NavGrid, PathBuffer, findPath } from './Pathfinding';
import type { Bitmap, BitmapFactory } from './ports';
import { hashCell } from './rng';
import type { ArtSet, FrameSet, SpriteCache } from './sprites/spriteFactory';
import type { SpriteTemplate, StageSprites } from './sprites/spriteTypes';

export interface PlacedProp {
  readonly zone: StageZone;
  /** Left edge in the zone. */
  readonly x: number;
  /** Top edge in screen y. */
  readonly y: number;
  readonly sheet: FrameSet;
  /** Milliseconds per animation frame. */
  readonly frameMs: number;
}

export interface StageLight {
  readonly zone: StageZone;
  /** Position in zone space; the renderer offsets corridor lights by the scroll. */
  readonly light: LightSource;
  readonly flicker: boolean;
}

export interface DripPoint {
  readonly zone: StageZone;
  /** Centre x within the zone. */
  readonly x: number;
  /** Landing y in screen px. */
  readonly y: number;
}

export interface StageRuntime {
  readonly def: StageDef;
  /** 128x180: wall, floor, and static props; the area below y 160 is transparent. */
  readonly alcoveStrip: Bitmap;
  /** 16x180: the door column (wall, floor, door frame). Drawn at x 128. */
  readonly doorStrip: Bitmap;
  /** 384x180: one repeating corridor segment. */
  readonly corridorStrip: Bitmap;
  /** 144x20: the foreground lip under the alcove and the door (drawn after entities). */
  readonly nearForeground: Bitmap;
  /** 384x20: the foreground lip under the corridor segment. */
  readonly corridorForeground: Bitmap;
  readonly backdrop: FrameSet;
  readonly nav: NavGrid;
  readonly lights: readonly StageLight[];
  /** Animated props (torches, ripples) drawn live, in the environment pass. */
  readonly livePropsBehind: readonly PlacedProp[];
  /** Solid floor props that sort with heroes. */
  readonly solidProps: readonly Entity[];
  readonly dripPoints: readonly DripPoint[];
  readonly clearColor: string;
  readonly ambientChar: string;
}

const ZONE_CODE: Readonly<Record<StageZone, number>> = { alcove: 0, door: 1, corridor: 2 };
const ZONE_WIDTH: Readonly<Record<StageZone, number>> = {
  alcove: ALCOVE_WIDTH,
  door: TILE,
  corridor: CORRIDOR_SEGMENT_PX,
};
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WALL_BOTTOM_Y = 128;

/** The campfire pit blocks the two nav columns in front of the logs. */
const PIT: Aabb = { x: CAMPFIRE_X - 8, y: CAMPFIRE_FOOT_Y - 8, w: 16, h: 8 };

function solidBox(
  solid: { w: number; h: number },
  x: number,
  footY: number,
  spriteW: number,
): Aabb {
  return {
    x: x + Math.floor((spriteW - solid.w) / 2),
    y: footY - solid.h + 1,
    w: solid.w,
    h: solid.h,
  };
}

/** Builds the navigation grid from the campfire pit and the stage's alcove solids. */
function buildNav(def: StageDef, sprites: StageSprites): NavGrid {
  const nav = new NavGrid(NAV_COLS, NAV_ROWS, NAV_CELL_PX, 0, FLOOR_Y);
  nav.block(PIT);
  for (const p of def.props) {
    const sprite = sprites.props[p.prop];
    if (p.solid !== null && p.zone === 'alcove' && sprite !== undefined) {
      nav.block(solidBox(p.solid, p.x, p.y, sprite.w));
    }
  }
  return nav;
}

function hasTransparency(t: SpriteTemplate): boolean {
  return (t.animations['idle']?.[0] ?? []).some((row) => row.includes('.'));
}

class TilePicker {
  readonly #stageIndex: number;
  readonly #sprites: StageSprites;
  readonly #cache: SpriteCache;
  readonly #solidWalls: readonly SpriteTemplate[];
  readonly #windows: readonly SpriteTemplate[];

  constructor(stageIndex: number, sprites: StageSprites, cache: SpriteCache) {
    this.#stageIndex = stageIndex;
    this.#sprites = sprites;
    this.#cache = cache;
    this.#solidWalls = sprites.tiles.wallMid.filter((t) => !hasTransparency(t));
    this.#windows = sprites.tiles.wallMid.filter(hasTransparency);
  }

  #pick(list: readonly SpriteTemplate[], zone: StageZone, col: number, row: number): Bitmap {
    const h = hashCell(this.#stageIndex, ZONE_CODE[zone], col, row);
    const t = list[h % Math.max(1, list.length)];
    const frame = t === undefined ? undefined : this.#cache.sheet(t).frames[0];
    if (frame === undefined) {
      throw new RangeError('Stage tile set is empty');
    }
    return frame;
  }

  /**
   * Wall-mid tiles: the barred-opening variants (transparent pixels, backdrop shows through) are
   * rare. They appear only in the middle wall row, never in the first or last column of a zone,
   * never next to another opening, and for about one cell in six.
   */
  wallMid(zone: StageZone, col: number, row: number, cols: number): Bitmap {
    const isWindowCell =
      this.#windows.length > 0 &&
      zone !== 'door' &&
      row === 3 &&
      col > 0 &&
      col < cols - 1 &&
      hashCell(this.#stageIndex, ZONE_CODE[zone], col, 99) % 6 === 0 &&
      !(col > 1 && hashCell(this.#stageIndex, ZONE_CODE[zone], col - 1, 99) % 6 === 0);
    return this.#pick(isWindowCell ? this.#windows : this.#solidWalls, zone, col, row);
  }

  tile(set: keyof StageSprites['tiles'], zone: StageZone, col: number, row: number): Bitmap {
    return this.#pick(this.#sprites.tiles[set], zone, col, row);
  }
}

function paintZone(
  surface: { drawBitmap(b: Bitmap, x: number, y: number, f: boolean): void },
  picker: TilePicker,
  zone: StageZone,
  cols: number,
): void {
  for (let col = 0; col < cols; col++) {
    const x = col * TILE;
    surface.drawBitmap(picker.tile('wallTop', zone, col, 0), x, 0, false);
    for (let row = 1; row <= 6; row++) {
      surface.drawBitmap(picker.wallMid(zone, col, row, cols), x, row * TILE, false);
    }
    surface.drawBitmap(picker.tile('wallBase', zone, col, 7), x, 7 * TILE, false);
    surface.drawBitmap(picker.tile('floorBack', zone, col, 8), x, FLOOR_Y, false);
    surface.drawBitmap(picker.tile('floorFront', zone, col, 9), x, FLOOR_Y + TILE, false);
  }
}

export function buildStage(
  def: StageDef,
  art: ArtSet,
  cache: SpriteCache,
  bitmaps: BitmapFactory,
): StageRuntime {
  const sprites = art.stageSprites[def.id];
  const clearChar = art.stageClearChar[def.id];
  const ambientChar = art.stageAmbientChar[def.id];
  if (sprites === undefined || clearChar === undefined || ambientChar === undefined) {
    throw new RangeError('Stage art is missing');
  }
  const clearColor = art.palette[clearChar] ?? '#000000';
  const picker = new TilePicker(def.index, sprites, cache);

  const zones: readonly StageZone[] = ['alcove', 'door', 'corridor'];
  const strips = new Map<StageZone, ReturnType<BitmapFactory['createOffscreen']>>();
  for (const zone of zones) {
    const width = ZONE_WIDTH[zone];
    const surface = bitmaps.createOffscreen(width, INTERNAL_HEIGHT);
    paintZone(surface, picker, zone, width / TILE);
    strips.set(zone, surface);
  }

  const live: PlacedProp[] = [];
  const solids: Entity[] = [];
  const lights: StageLight[] = [];
  const drips: DripPoint[] = [];
  const lightChars = [art.lightChars.torch, art.lightChars.campfire];

  // Wall props first, then floor props, so floor decoration sits over wall bases.
  for (const layer of ['wall', 'floor'] as const) {
    for (const p of def.props) {
      if (p.layer !== layer) {
        continue;
      }
      const template = sprites.props[p.prop];
      if (template === undefined) {
        throw new RangeError('Stage prop is missing');
      }
      const sheet = cache.sheet(template);
      const top = p.y - sheet.anchor.y;
      const strip = strips.get(p.zone);
      if (p.light !== null) {
        lights.push({
          zone: p.zone,
          flicker: p.light.flicker,
          light: {
            x: p.x + sheet.w / 2,
            y: top + 6,
            radius: p.light.radius,
            intensity: p.light.intensity,
            colorIndex: Math.max(0, lightChars.indexOf(p.light.colorChar)),
          },
        });
      }
      if (p.prop === 'puddle') {
        drips.push({ zone: p.zone, x: p.x + sheet.w / 2, y: p.y - 1 });
      }
      if (p.solid !== null && p.zone === 'alcove') {
        solids.push(new Prop(sheet, p.x, p.y));
      } else if (sheet.frames.length > 1) {
        live.push({
          zone: p.zone,
          x: p.x,
          y: top,
          sheet,
          frameMs: p.prop === 'torch' ? TORCH_FRAME_MS : PROP_FRAME_MS,
        });
      } else {
        const frame = sheet.frames[0];
        if (strip !== undefined && frame !== undefined) {
          strip.drawBitmap(frame, p.x, top, false);
        }
      }
    }
  }

  const foregroundNear = bitmaps.createOffscreen(
    ALCOVE_WIDTH + TILE,
    INTERNAL_HEIGHT - FOREGROUND_Y,
  );
  const foregroundCorridor = bitmaps.createOffscreen(
    CORRIDOR_SEGMENT_PX,
    INTERNAL_HEIGHT - FOREGROUND_Y,
  );
  const paintForeground = (
    target: ReturnType<BitmapFactory['createOffscreen']>,
    zone: StageZone,
    x0: number,
    cols: number,
  ): void => {
    target.fillRect(clearColor, 0, TILE, cols * TILE, INTERNAL_HEIGHT - FOREGROUND_Y - TILE);
    for (let col = 0; col < cols; col++) {
      target.drawBitmap(picker.tile('foreground', zone, x0 / TILE + col, 10), col * TILE, 0, false);
    }
  };
  paintForeground(foregroundNear, 'alcove', 0, (ALCOVE_WIDTH + TILE) / TILE);
  paintForeground(foregroundCorridor, 'corridor', 0, CORRIDOR_SEGMENT_PX / TILE);

  const alcove = strips.get('alcove');
  const door = strips.get('door');
  const corridor = strips.get('corridor');
  if (alcove === undefined || door === undefined || corridor === undefined) {
    throw new RangeError('Stage strips were not built');
  }
  return {
    def,
    alcoveStrip: alcove.bitmap,
    doorStrip: door.bitmap,
    corridorStrip: corridor.bitmap,
    nearForeground: foregroundNear.bitmap,
    corridorForeground: foregroundCorridor.bitmap,
    backdrop: cache.sheet(sprites.backdrop),
    nav: buildNav(def, sprites),
    lights,
    livePropsBehind: live,
    solidProps: solids,
    dripPoints: drips,
    clearColor,
    ambientChar,
  };
}

/** Fixed-text errors for the stage table (empty means valid). */
export function validateStages(stages: readonly StageDef[], art: ArtSet): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  stages.forEach((def, i) => {
    const tag = `stage ${def.index}`;
    if (!KEBAB.test(def.id)) {
      errors.push(`${tag}: id is not kebab-case`);
    }
    if (ids.has(def.id)) {
      errors.push(`${tag}: duplicate id`);
    }
    ids.add(def.id);
    if (def.index !== i + 1) {
      errors.push(`${tag}: index is not contiguous`);
    }
    const sprites = art.stageSprites[def.id];
    if (sprites === undefined) {
      errors.push(`${tag}: no stage art`);
      return;
    }
    for (const [name, list] of Object.entries(sprites.tiles)) {
      if (list.length === 0) {
        errors.push(`${tag}: tile list ${name} is empty`);
      }
    }
    let lightCount = 0;
    let doorFrames = 0;
    for (const p of def.props) {
      const sprite = sprites.props[p.prop];
      if (sprite === undefined) {
        errors.push(`${tag}: unknown prop ${p.prop}`);
        continue;
      }
      if (p.zone === 'door') {
        doorFrames++;
        if (p.x !== 0 || p.layer !== 'wall' || sprite.w > TILE || p.solid !== null) {
          errors.push(`${tag}: ${p.prop} in the door zone must be a non-solid wall prop at x 0`);
        }
      } else if (p.x < 0 || p.x + sprite.w > ZONE_WIDTH[p.zone]) {
        errors.push(`${tag}: ${p.prop} is outside the ${p.zone}`);
      }
      if (p.layer === 'wall') {
        if (p.y < 0 || p.y + sprite.h > WALL_BOTTOM_Y) {
          errors.push(`${tag}: wall prop ${p.prop} is outside the wall rows`);
        }
      } else if (p.y < FLOOR_Y || p.y >= FOREGROUND_Y) {
        errors.push(`${tag}: floor prop ${p.prop} foot is outside the floor band`);
      }
      if (p.solid !== null) {
        if (p.zone !== 'alcove' || p.layer !== 'floor') {
          errors.push(`${tag}: solid ${p.prop} must be an alcove floor prop`);
        } else {
          const box = solidBox(p.solid, p.x, p.y, sprite.w);
          if (
            box.y < FLOOR_Y ||
            box.y + box.h > FOREGROUND_Y ||
            box.x < 0 ||
            box.x + box.w > ALCOVE_WIDTH
          ) {
            errors.push(`${tag}: solid ${p.prop} footprint leaves the floor band`);
          }
        }
      }
      if (p.light !== null) {
        lightCount++;
        const l = p.light;
        if (
          !(l.radius >= 8 && l.radius <= 96) ||
          !(l.intensity >= 0 && l.intensity <= 1) ||
          (l.colorChar !== art.lightChars.torch && l.colorChar !== art.lightChars.campfire)
        ) {
          errors.push(`${tag}: light on ${p.prop} is out of range`);
        }
      }
    }
    if (doorFrames !== 1) {
      errors.push(`${tag}: expected exactly one door-zone prop, found ${doorFrames}`);
    }
    if (lightCount > 8) {
      errors.push(`${tag}: more than 8 lights`);
    }
    errors.push(...validateConnectivity(tag, def, sprites));
  });
  return errors;
}

function validateConnectivity(tag: string, def: StageDef, sprites: StageSprites): string[] {
  const errors: string[] = [];
  const nav = buildNav(def, sprites);
  const path = new PathBuffer(NAV_COLS * NAV_ROWS);
  const door: Point = { x: 0, y: 0 };
  entrancePosition(0, door);
  if (nav.cellAt(door.x, door.y) < 0 || nav.blocked[nav.cellAt(door.x, door.y)] === 1) {
    errors.push(`${tag}: the door entrance is blocked`);
    return errors;
  }
  const slot: Point = { x: 0, y: 0 };
  const checks: readonly ((slot: number, out: Point) => void)[] = [seatPosition, formationPosition];
  const names = ['seat', 'formation slot'] as const;
  checks.forEach((place, k) => {
    for (let i = 0; i < VISIBLE_SLOTS; i++) {
      place(i, slot);
      const cell = nav.cellAt(slot.x, slot.y);
      if (cell < 0 || nav.blocked[cell] === 1) {
        errors.push(`${tag}: ${names[k] ?? 'slot'} ${i} is on a blocked cell`);
      } else if (findPath(nav, door.x, door.y, slot.x, slot.y, path) === 0) {
        errors.push(`${tag}: ${names[k] ?? 'slot'} ${i} is unreachable from the door`);
      }
    }
  });
  return errors;
}
