// Draw order (docs/architecture/game-engine.md section 8). Environment layers are lit by one
// multiply blit; entities are drawn after the light pass and are never darkened. Everything is
// drawn at whole-pixel positions. Steady state allocates nothing: strips are pre-rendered, the
// entity sort buffer and draw context are reused, and per-entity guards share one closure.
import type { Camera } from './Camera';
import { loopFrameIndex } from './data/animations';
import {
  BACKDROP_PARALLAX,
  BACKDROP_WIDTH_PX,
  EFFECT_FAULT_LIMIT,
  TORCH_FLICKER_MS,
} from './data/tuning';
import { Hero } from './entities/Hero';
import { guarded } from './entities/Entity';
import type { Entity, World } from './entities/Entity';
import {
  CORRIDOR_SEGMENT_PX,
  CORRIDOR_X,
  DOOR_X,
  FOREGROUND_Y,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  TILE,
} from './layout';
import { Lighting } from './Lighting';
import type { LightSource } from './Lighting';
import type { ParticleColors } from './Particles';
import type { BitmapFactory, ErrorSink, Surface } from './ports';
import { hashCell } from './rng';
import type { ArtSet, FrameSet } from './sprites/spriteFactory';
import type { Bitmap } from './ports';
import type { PlacedProp, StageRuntime } from './Stage';

/** A mutable DrawContext reused for every entity (the entity API sees it as readonly). */
interface MutableDrawContext {
  surface: Surface;
  camera: Camera;
  world: World;
}

const SHADOW_ALPHA = 0.35;
const BEAM_CORE_ALPHA = 0.7;
const BEAM_HALO_ALPHA = 0.3;
const BEAM_HEIGHT = 36;
const FLICKER_PX = 4;

/** Blits the corridor view (x 144..319) of a repeating 384-wide strip, wrapping at the seam. */
function blitCorridor(
  surface: Surface,
  strip: Bitmap,
  offset: number,
  srcY: number,
  height: number,
  destY: number,
): void {
  const visible = INTERNAL_WIDTH - CORRIDOR_X;
  const first = Math.min(CORRIDOR_SEGMENT_PX - offset, visible);
  surface.drawBitmapRegion(strip, offset, srcY, first, height, CORRIDOR_X, destY, first, height);
  if (first < visible) {
    const rest = visible - first;
    surface.drawBitmapRegion(strip, 0, srcY, rest, height, CORRIDOR_X + first, destY, rest, height);
  }
}

/** Draws a sprite frame clipped horizontally to [minX, maxX); skips it when fully outside. */
function drawClipped(
  surface: Surface,
  frame: Bitmap,
  set: FrameSet,
  dx: number,
  dy: number,
  minX: number,
  maxX: number,
): void {
  const left = Math.max(dx, minX);
  const right = Math.min(dx + set.w, maxX);
  if (right <= left) {
    return;
  }
  if (left === dx && right === dx + set.w) {
    surface.drawBitmap(frame, dx, dy, false);
    return;
  }
  surface.drawBitmapRegion(frame, left - dx, 0, right - left, set.h, left, dy, right - left, set.h);
}

const LIGHT_FAULT_LIMIT = 3;

export class Renderer {
  readonly #bitmaps: BitmapFactory;
  readonly #art: ArtSet;
  readonly #onError: ErrorSink;
  readonly #lightings = new Map<string, Lighting>();
  readonly #particleColors: ParticleColors;
  readonly #sortBuf: Entity[] = [];
  readonly #scratchLight: LightSource = { x: 0, y: 0, radius: 0, intensity: 0, colorIndex: 0 };
  readonly #white: string;
  #ctx: MutableDrawContext | null = null;
  #current: Entity | null = null;
  #clockMs = 0;
  #lightFaults = 0;
  #lightFaultReported = false;
  #effectFaults = 0;
  #effectFaultReported = false;
  readonly #drawCurrent = (): void => {
    if (this.#current !== null && this.#ctx !== null) {
      this.#current.draw(this.#ctx);
    }
  };

  constructor(bitmaps: BitmapFactory, art: ArtSet, onError: ErrorSink = () => undefined) {
    this.#bitmaps = bitmaps;
    this.#art = art;
    this.#onError = onError;
    const css = (chars: readonly string[]): string[] =>
      chars.map((ch) => art.palette[ch] ?? '#ffffff');
    this.#particleColors = {
      ember: css(art.particlePalette.ember),
      spark: css(art.particlePalette.spark),
      drip: css(art.particlePalette.drip),
      splash: css(art.particlePalette.splash),
    };
    this.#white = art.palette['w'] ?? '#ffffff';
  }

  /** Advances the cosmetic clock used by animated props and light flicker. */
  advanceClock(dtMs: number): void {
    this.#clockMs += dtMs;
  }

  render(surface: Surface, world: World, heroes: readonly Entity[], camera: Camera): void {
    const stage = world.stage;
    surface.setComposite('source-over');
    surface.setAlpha(1);
    surface.clear(stage.clearColor);

    const corridorOffset = camera.corridorOffset();
    this.#drawBackdrop(surface, stage, camera);
    surface.drawBitmap(stage.alcoveStrip, 0, 0, false);
    surface.drawBitmap(stage.doorStrip, DOOR_X, 0, false);
    blitCorridor(surface, stage.corridorStrip, corridorOffset, 0, INTERNAL_HEIGHT, 0);
    this.#drawLiveProps(surface, stage, corridorOffset);

    this.#guardedLightPass(surface, world, corridorOffset);

    this.#sortEntities(world, heroes);
    this.#drawShadows(surface, stage.clearColor);
    if (this.#ctx === null) {
      this.#ctx = { surface, camera, world };
    } else {
      this.#ctx.surface = surface;
      this.#ctx.camera = camera;
      this.#ctx.world = world;
    }
    for (const entity of this.#sortBuf) {
      this.#current = entity;
      guarded(entity, 'draw', this.#drawCurrent, this.#onError);
      if (entity instanceof Hero) {
        this.#drawBeam(surface, entity);
      }
    }
    this.#current = null;

    this.#guardedEffectPass(surface, world);

    const fgH = INTERNAL_HEIGHT - FOREGROUND_Y;
    surface.drawBitmap(stage.nearForeground, 0, FOREGROUND_Y, false);
    blitCorridor(surface, stage.corridorForeground, corridorOffset, 0, fgH, FOREGROUND_Y);

    world.particles.draw(surface, this.#particleColors);

    surface.setComposite('source-over');
    surface.setAlpha(1);
  }

  #drawBackdrop(surface: Surface, stage: StageRuntime, camera: Camera): void {
    const frame = stage.backdrop.frames[0];
    if (frame === undefined) {
      return;
    }
    // The alcove and door are static; only the corridor view slides (parallax 0.25).
    surface.drawBitmap(frame, 0, 0, false);
    surface.drawBitmapRegion(
      frame,
      0,
      0,
      TILE,
      BACKDROP_WIDTH_PX,
      DOOR_X,
      0,
      TILE,
      BACKDROP_WIDTH_PX,
    );
    let src = camera.parallaxOffset(BACKDROP_PARALLAX, BACKDROP_WIDTH_PX);
    let destX = CORRIDOR_X;
    while (destX < INTERNAL_WIDTH) {
      const take = Math.min(BACKDROP_WIDTH_PX - src, INTERNAL_WIDTH - destX);
      surface.drawBitmapRegion(
        frame,
        src,
        0,
        take,
        BACKDROP_WIDTH_PX,
        destX,
        0,
        take,
        BACKDROP_WIDTH_PX,
      );
      destX += take;
      src = 0;
    }
  }

  #drawLiveProps(surface: Surface, stage: StageRuntime, corridorOffset: number): void {
    for (const prop of stage.livePropsBehind) {
      const frame =
        prop.sheet.frames[loopFrameIndex(prop.frameMs, this.#clockMs, prop.sheet.frames.length)];
      if (frame === undefined) {
        continue;
      }
      this.#drawLiveProp(surface, prop, frame, corridorOffset);
    }
  }

  #drawLiveProp(surface: Surface, prop: PlacedProp, frame: Bitmap, corridorOffset: number): void {
    if (prop.zone === 'alcove') {
      drawClipped(surface, frame, prop.sheet, prop.x, prop.y, 0, DOOR_X);
    } else if (prop.zone === 'door') {
      drawClipped(surface, frame, prop.sheet, DOOR_X + prop.x, prop.y, DOOR_X, CORRIDOR_X);
    } else {
      const sx = CORRIDOR_X + prop.x - corridorOffset;
      for (let k = -1; k <= 1; k++) {
        drawClipped(
          surface,
          frame,
          prop.sheet,
          sx + k * CORRIDOR_SEGMENT_PX,
          prop.y,
          CORRIDOR_X,
          INTERNAL_WIDTH,
        );
      }
    }
  }

  #lighting(stage: StageRuntime): Lighting {
    let lighting = this.#lightings.get(stage.def.id);
    if (lighting === undefined) {
      lighting = new Lighting(this.#bitmaps, this.#art.palette, stage.ambientChar, [
        this.#art.lightChars.torch,
        this.#art.lightChars.campfire,
      ]);
      this.#lightings.set(stage.def.id, lighting);
    }
    return lighting;
  }

  /** Lighting is built outside the entity guard, so it gets its own: report once, disable after a few faults. */
  #guardedLightPass(surface: Surface, world: World, corridorOffset: number): void {
    if (this.#lightFaults >= LIGHT_FAULT_LIMIT) {
      return;
    }
    try {
      this.#lightPass(surface, world, corridorOffset);
    } catch (error) {
      this.#lightFaults++;
      if (!this.#lightFaultReported) {
        this.#lightFaultReported = true;
        this.#onError(error, 'render');
      }
      // A fault mid-compose may leave the multiply state set; entities must draw normally.
      surface.setComposite('source-over');
      surface.setAlpha(1);
    }
  }

  /** Effects draw after the entities, unlit, before the foreground; own guard, disabled after a few faults. */
  #guardedEffectPass(surface: Surface, world: World): void {
    if (this.#effectFaults >= EFFECT_FAULT_LIMIT) {
      return;
    }
    try {
      world.effects.draw(surface, world.cache);
    } catch (error) {
      this.#effectFaults++;
      if (!this.#effectFaultReported) {
        this.#effectFaultReported = true;
        this.#onError(error, 'render');
      }
      surface.setComposite('source-over');
      surface.setAlpha(1);
    }
  }

  #lightPass(surface: Surface, world: World, corridorOffset: number): void {
    const stage = world.stage;
    const lighting = this.#lighting(stage);
    const light = this.#scratchLight;
    lighting.begin();
    const tick = Math.floor(this.#clockMs / TORCH_FLICKER_MS);
    for (let i = 0; i < stage.lights.length; i++) {
      const source = stage.lights[i];
      if (source === undefined) {
        continue;
      }
      const flicker = source.flicker ? ((hashCell(i + 1, tick, 7, 7) % 3) - 1) * FLICKER_PX : 0;
      light.y = source.light.y;
      light.radius = source.light.radius + flicker;
      light.intensity = source.light.intensity;
      light.colorIndex = source.light.colorIndex;
      if (source.zone === 'corridor') {
        for (let k = -1; k <= 1; k++) {
          const x = CORRIDOR_X + source.light.x - corridorOffset + k * CORRIDOR_SEGMENT_PX;
          if (x + light.radius > CORRIDOR_X && x - light.radius < INTERNAL_WIDTH) {
            light.x = x;
            lighting.add(light);
          }
        }
      } else {
        light.x = source.zone === 'door' ? DOOR_X + source.light.x : source.light.x;
        lighting.add(light);
      }
    }
    const fire = world.campfire;
    light.x = fire.x;
    light.y = fire.lightY;
    light.radius = fire.lightRadius;
    light.intensity = fire.lightIntensity;
    light.colorIndex = 1;
    lighting.add(light);
    lighting.compose(surface);
  }

  #sortEntities(world: World, heroes: readonly Entity[]): void {
    const buf = this.#sortBuf;
    buf.length = 0;
    for (const hero of heroes) {
      buf.push(hero);
    }
    for (const summon of world.summons.entities()) {
      buf.push(summon);
    }
    buf.push(world.campfire);
    for (const prop of world.stage.solidProps) {
      buf.push(prop);
    }
    // Stable insertion sort by foot y: the list is nearly sorted frame to frame.
    for (let i = 1; i < buf.length; i++) {
      const item = buf[i];
      if (item === undefined) {
        continue;
      }
      let j = i - 1;
      while (j >= 0 && (buf[j]?.sortY ?? 0) > item.sortY) {
        const moved = buf[j];
        if (moved !== undefined) {
          buf[j + 1] = moved;
        }
        j--;
      }
      buf[j + 1] = item;
    }
  }

  #drawShadows(surface: Surface, color: string): void {
    surface.setAlpha(SHADOW_ALPHA);
    for (const entity of this.#sortBuf) {
      const w = entity.shadowWidth;
      if (w > 0) {
        surface.fillRect(color, Math.floor(entity.x - w / 2), Math.floor(entity.sortY) - 1, w, 2);
      }
    }
    surface.setAlpha(1);
  }

  /** The warp beam: a pillar of light with a halo, drawn over the hero it belongs to. */
  #drawBeam(surface: Surface, hero: Hero): void {
    const strength = hero.warpBeam;
    if (strength <= 0) {
      return;
    }
    const x = Math.floor(hero.x);
    const y = Math.floor(hero.y);
    surface.setAlpha(BEAM_HALO_ALPHA * strength);
    surface.fillRect(this.#white, x - 5, y - BEAM_HEIGHT, 10, BEAM_HEIGHT);
    surface.setAlpha(BEAM_CORE_ALPHA * strength);
    surface.fillRect(this.#white, x - 2, y - BEAM_HEIGHT, 4, BEAM_HEIGHT);
    surface.setAlpha(1);
  }
}
