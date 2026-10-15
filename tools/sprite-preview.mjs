// Dev-only sprite preview (never shipped: tools/** is in .vscodeignore). Owned by the pixel-artist.
// Renders the procedural palette-indexed art to a PNG you can open, with no dependencies beyond the
// repo's esbuild. Usage:
//   node tools/sprite-preview.mjs enemies <stage id|all> <out.png> [scale]
//   node tools/sprite-preview.mjs stage <stage id> <out.png> [scale]
// SPRITE_ENTRY=<path to a .ts file> previews art that is not wired into spriteTemplates.ts yet
// (the file must export the same names: ENEMY_SPRITES, ENEMY_PHASE_PALETTES, STAGE_SPRITES, STAGE_PALETTES).
// `enemies` draws every enemy of the stage as rows of animation frames on a floor-colored
// background, then the same frames as black silhouettes. `stage` draws the tile sets, the props,
// the backdrop, and a mock 320x180 room.

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const [, , mode, stageArg, outArg, scaleArg] = process.argv;
if (!mode || !stageArg || !outArg) {
  process.stderr.write(
    'usage: sprite-preview.mjs enemies|stage <stage id|all> <out.png> [scale]\n',
  );
  process.exit(2);
}
const scale = Number(scaleArg ?? (mode === 'enemies' ? 6 : 3));
const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'sprite-preview-'));
const bundle = join(dir, 'art.mjs');
await build({
  entryPoints: [process.env.SPRITE_ENTRY ?? join(root, 'src/game/sprites/spriteTemplates.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'error',
});
const art = await import(pathToFileURL(bundle).href);
const { MASTER_PALETTE } = await import(
  pathToFileURL(
    await (async () => {
      const out = join(dir, 'pal.mjs');
      await build({
        entryPoints: [join(root, 'src/game/sprites/palettes.ts')],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile: out,
        logLevel: 'error',
      });
      return out;
    })(),
  ).href
);

// ---- tiny raster canvas ----
class Canvas {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4);
    this.fill(bg);
  }
  fill(rgb) {
    for (let i = 0; i < this.w * this.h; i++) {
      this.px.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
  }
  set(x, y, rgb) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px.set([rgb[0], rgb[1], rgb[2], 255], (y * this.w + x) * 4);
  }
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function drawRows(cv, rows, ox, oy, pal, s, silhouette = false) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const h = silhouette ? '#000000' : pal[ch];
      if (!h) throw new Error(`unknown character ${ch}`);
      const c = hex(h);
      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) cv.set(ox + x * s + dx, oy + y * s + dy, c);
    }
  });
}

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(cv) {
  const raw = Buffer.alloc((cv.w * 4 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 4 + 1)] = 0;
    Buffer.from(cv.px.buffer, y * cv.w * 4, cv.w * 4).copy(raw, y * (cv.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ENEMY_STAGE = {
  'forgotten-cellar': ['cellar-rat', 'cave-bat', 'web-spider', 'crate-mimic', 'rat-king'],
  'goblin-mine-shafts': [
    'goblin-miner',
    'goblin-scout',
    'ore-beetle',
    'rock-golem',
    'goblin-foreman',
  ],
  'toxic-slime-caverns': ['green-slime', 'spore-shroom', 'toxic-toad', 'jelly-cube', 'ooze-queen'],
  'ancient-catacombs': ['bone-soldier', 'wailing-ghost', 'tomb-scarab', 'crypt-mummy', 'tomb-lich'],
  'enchanted-forest-ruins': [
    'thorn-sprout',
    'moss-wolf',
    'bramble-pixie',
    'ancient-treant',
    'elder-dryad',
  ],
  'molten-core': ['ember-imp', 'slag-snail', 'magma-crab', 'furnace-guard', 'molten-colossus'],
  'frozen-citadel': ['rime-penguin', 'frost-hare', 'snow-sentry', 'snow-yeti', 'glacier-mammoth'],
  'shadow-realm': [
    'lantern-wraith',
    'shard-cluster',
    'mirror-mimic',
    'gloom-stag',
    'eclipse-warden',
  ],
  'dragons-lair': ['drake-whelp', 'kobold-sapper', 'gilded-crown', 'ash-wyvern', 'hoard-dragon'],
  'void-spire': [
    'crescent-drifter',
    'comet-tadpole',
    'eye-strider',
    'obelisk-sentinel',
    'void-sovereign',
  ],
};
const palFor = (stageId, phase) => ({
  ...MASTER_PALETTE,
  ...(art.STAGE_PALETTES[stageId] ?? {}),
  ...(phase ?? {}),
});
const enemyStage = (id) =>
  Object.keys(ENEMY_STAGE).find((k) => ENEMY_STAGE[k].includes(id)) ?? 'forgotten-cellar';

if (mode === 'enemies') {
  const ids = Object.keys(art.ENEMY_SPRITES).filter(
    (id) => stageArg === 'all' || enemyStage(id) === stageArg || id === stageArg,
  );
  const gap = 3 * scale;
  const cells = [];
  let width = 0;
  let height = gap;
  const maxW = 1500;
  for (const id of ids) {
    const t = art.ENEMY_SPRITES[id];
    const phases = [null, ...(art.ENEMY_PHASE_PALETTES[id] ?? [])];
    for (const ph of phases) {
      for (const sil of [false, true]) {
        let x = gap;
        for (const [name, frames] of Object.entries(t.animations)) {
          for (const f of frames) {
            if (x + t.w * scale > maxW) {
              x = gap;
              height += t.h * scale + gap;
            }
            cells.push({ id, t, rows: f, x, y: height, ph, sil, name });
            x += t.w * scale + gap;
            width = Math.max(width, x);
          }
          x += gap;
        }
        height += t.h * scale + gap;
      }
    }
  }
  const cv = new Canvas(width, height + gap, [0, 0, 0]);
  for (const c of cells) {
    const pal = palFor(enemyStage(c.id), c.ph);
    const floor = hex(pal['3']);
    const wall = hex(pal['2']);
    for (let y = 0; y < c.t.h * scale; y++) {
      for (let x = 0; x < c.t.w * scale; x++) {
        cv.set(c.x + x, c.y + y, y >= (c.t.anchor.y + 1) * scale - 3 * scale ? floor : wall);
      }
    }
    drawRows(cv, c.rows, c.x, c.y, pal, scale, c.sil);
  }
  writeFileSync(outArg, png(cv));
} else if (mode === 'stage') {
  const sp = art.STAGE_SPRITES[stageArg];
  if (!sp) throw new Error(`no stage ${stageArg}`);
  const pal = palFor(stageArg);
  const s = scale;
  const gap = 2 * s;
  const cv = new Canvas(1200, 1400, hex(pal.n));
  let y = gap;
  // tile sets
  for (const [name, list] of Object.entries(sp.tiles)) {
    let x = gap;
    for (const t of list) {
      drawRows(cv, t.animations.idle[0], x, y, pal, s);
      x += 16 * s + gap;
    }
    y += 16 * s + gap;
    void name;
  }
  // props (all frames)
  let x = gap;
  let rowH = 0;
  for (const [name, t] of Object.entries(sp.props)) {
    for (const f of t.animations.idle) {
      if (x + t.w * s > 1180) {
        x = gap;
        y += rowH + gap;
        rowH = 0;
      }
      drawRows(cv, f, x, y, pal, s);
      x += t.w * s + gap;
      rowH = Math.max(rowH, t.h * s);
    }
    void name;
  }
  y += rowH + gap;
  // backdrop (2 periods)
  drawRows(cv, sp.backdrop.animations.idle[0], gap, y, pal, 2);
  y += 128 * 2 + gap;
  // mock room, 320x180 at 3x
  const rs = 3;
  const room = new Canvas(320 * rs, 180 * rs, hex(pal.n));
  const bd = sp.backdrop.animations.idle[0];
  for (let yy = 0; yy < 112; yy++) {
    for (let xx = 0; xx < 320; xx++) {
      const ch = bd[yy + 8]?.[xx % 128] ?? '.';
      if (ch !== '.')
        for (let dy = 0; dy < rs; dy++)
          for (let dx = 0; dx < rs; dx++) room.set(xx * rs + dx, yy * rs + dy, hex(pal[ch]));
    }
  }
  const put = (t, f, px, py) => drawRows(room, t.animations.idle[f], px * rs, py * rs, pal, rs);
  for (let c = 0; c < 20; c++) {
    put(sp.tiles.wallTop[c % 2], 0, c * 16, 0);
    for (let r = 1; r <= 6; r++)
      put(sp.tiles.wallMid[(c * 3 + r * 5) % sp.tiles.wallMid.length], 0, c * 16, r * 16);
    put(sp.tiles.wallBase[c % 2], 0, c * 16, 112);
    put(sp.tiles.floorBack[c % 3], 0, c * 16, 128);
    put(sp.tiles.floorFront[(c + 1) % 3], 0, c * 16, 144);
    put(sp.tiles.foreground[c % 2], 0, c * 16, 160);
  }
  const wallProp = (name, px, py, f = 0) => {
    const t = sp.props[name];
    if (t)
      drawRows(room, t.animations.idle[f % t.animations.idle.length], px * rs, py * rs, pal, rs);
  };
  const floorProp = (name, px, py) => {
    const t = sp.props[name];
    if (t)
      drawRows(room, t.animations.idle[0], (px - t.anchor.x) * rs, (py - t.anchor.y) * rs, pal, rs);
  };
  if (stageArg === 'goblin-mine-shafts') {
    wallProp('doorFrame', 128, 0);
    wallProp('support', 0, 16);
    wallProp('support', 224, 16);
    wallProp('lantern', 28, 40);
    wallProp('lantern', 92, 40, 1);
    wallProp('lantern', 188, 40, 2);
    wallProp('pickaxe', 52, 44);
    wallProp('oreVein', 108, 72);
    wallProp('oreVein', 270, 72);
    floorProp('minecart', 14, 134);
    floorProp('rubble', 96, 150);
    floorProp('rubble', 250, 152);
  } else if (stageArg === 'toxic-slime-caverns') {
    wallProp('doorFrame', 128, 0);
    wallProp('slimeDrape', 40, 16);
    wallProp('slimeDrape', 214, 16);
    wallProp('pipe', 4, 56);
    wallProp('pipe', 20, 56);
    wallProp('pipe', 232, 80);
    wallProp('glowShroom', 76, 90, 0);
    wallProp('glowShroom', 186, 90, 1);
    wallProp('glowShroom', 290, 70, 0);
    floorProp('toxicBarrel', 24, 134);
    floorProp('slimePool', 96, 152);
    floorProp('mushrooms', 70, 140);
    floorProp('mushrooms', 250, 150);
  } else if (stageArg === 'ancient-catacombs') {
    wallProp('doorFrame', 128, 0);
    wallProp('crackedPillar', 4, 8);
    wallProp('crackedPillar', 230, 8);
    wallProp('skullNiche', 50, 40);
    wallProp('skullNiche', 190, 40);
    wallProp('candelabra', 30, 56, 0);
    wallProp('candelabra', 100, 56, 1);
    wallProp('candelabra', 270, 56, 2);
    floorProp('sarcophagus', 24, 134);
    floorProp('urn', 84, 150);
    floorProp('boneRubble', 62, 150);
    floorProp('boneRubble', 256, 152);
  } else if (stageArg === 'dragons-lair') {
    wallProp('doorFrame', 128, 0);
    wallProp('scorchedPillar', 150, 8);
    wallProp('scorchedPillar', 230, 8);
    wallProp('drakeSkull', 52, 40);
    wallProp('scaleBanner', 220, 20);
    wallProp('hoardBrazier', 28, 40, 0);
    wallProp('hoardBrazier', 92, 40, 1);
    wallProp('hoardBrazier', 252, 40, 2);
    wallProp('goldVein', 60, 96);
    wallProp('goldVein', 280, 96, 1);
    floorProp('hoardPile', 14, 134);
    floorProp('goldScatter', 66, 152);
    floorProp('goldScatter', 220, 148);
  } else if (stageArg === 'void-spire') {
    wallProp('doorFrame', 128, 0);
    wallProp('spirePillar', 150, 8);
    wallProp('spirePillar', 4, 8);
    wallProp('starWindow', 52, 40);
    wallProp('voidRift', 28, 40, 0);
    wallProp('voidRift', 92, 40, 2);
    wallProp('orbitRing', 252, 40, 1);
    floorProp('riftPedestal', 14, 134);
    floorProp('crackedSlab', 66, 152);
    floorProp('crackedSlab', 220, 148);
  } else {
    wallProp('doorFrame', 128, 0);
    wallProp('torch', 28, 40);
    wallProp('chains', 46, 16);
    floorProp('barrel', 14, 134);
    floorProp('bonePile', 18, 152);
  }
  for (let yy = 0; yy < room.h; yy++)
    for (let xx = 0; xx < room.w; xx++)
      cv.set(gap + xx, y + yy, [
        ...room.px.slice((yy * room.w + xx) * 4, (yy * room.w + xx) * 4 + 3),
      ]);
  y += room.h + gap;
  const out = new Canvas(1200, y, [0, 0, 0]);
  out.px.set(cv.px.slice(0, 1200 * y * 4));
  writeFileSync(outArg, png(out));
} else {
  process.stderr.write('unknown mode\n');
  process.exit(2);
}
process.stdout.write(`wrote ${outArg}\n`);
