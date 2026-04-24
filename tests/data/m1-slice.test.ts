import { describe, it, expect } from 'vitest';
import m1 from '@/data/maps/m1-slice.json';

type TileLayer = {
  type: 'tilelayer';
  name: string;
  width: number;
  height: number;
  data: number[];
};

type ObjectLayer = {
  type: 'objectgroup';
  name: string;
  objects: {
    name: string;
    type: string;
    x: number;
    y: number;
  }[];
};

type Layer = TileLayer | ObjectLayer;

describe('m1-slice map (Tiled JSON)', () => {
  it('declares the expected 32x32 grid and 40x23 dimensions', () => {
    expect(m1.tilewidth).toBe(32);
    expect(m1.tileheight).toBe(32);
    expect(m1.width).toBe(40);
    expect(m1.height).toBe(23);
    expect(m1.orientation).toBe('orthogonal');
    expect(m1.type).toBe('map');
  });

  it('ships a placeholder tileset reference with firstgid 1', () => {
    expect(m1.tilesets).toHaveLength(1);
    const [ts] = m1.tilesets;
    expect(ts.name).toBe('placeholder');
    expect(ts.firstgid).toBe(1);
    expect(ts.tilewidth).toBe(32);
    expect(ts.tileheight).toBe(32);
  });

  it('includes ground/forest/water tile layers and a spawns objectgroup', () => {
    const layers = m1.layers as Layer[];
    const names = layers.map((l) => l.name);
    expect(names).toContain('ground');
    expect(names).toContain('forest');
    expect(names).toContain('water');
    expect(names).toContain('spawns');

    for (const name of ['ground', 'forest', 'water'] as const) {
      const layer = layers.find((l) => l.name === name) as TileLayer;
      expect(layer.type).toBe('tilelayer');
      expect(layer.width).toBe(40);
      expect(layer.height).toBe(23);
      expect(layer.data).toHaveLength(40 * 23);
    }

    const spawns = layers.find((l) => l.name === 'spawns') as ObjectLayer;
    expect(spawns.type).toBe('objectgroup');
  });

  it('places 3 spawn markers (N/S/W) and a fort-core on the object layer', () => {
    const spawns = (m1.layers as Layer[]).find(
      (l) => l.name === 'spawns',
    ) as ObjectLayer;
    const byName = Object.fromEntries(spawns.objects.map((o) => [o.name, o]));

    expect(byName['spawn-north']).toBeDefined();
    expect(byName['spawn-south']).toBeDefined();
    expect(byName['spawn-west']).toBeDefined();
    expect(byName['fort-core']).toBeDefined();

    // North edge: y at top of the map
    expect(byName['spawn-north'].y).toBe(0);
    expect(byName['spawn-north'].type).toBe('spawn');

    // South edge: y at bottom row (row 22 * 32)
    expect(byName['spawn-south'].y).toBe(22 * 32);
    expect(byName['spawn-south'].type).toBe('spawn');

    // West edge: x at left column
    expect(byName['spawn-west'].x).toBe(0);
    expect(byName['spawn-west'].type).toBe('spawn');

    // Fort-core is center-east (col 30 of 40, row 11 of 23)
    expect(byName['fort-core'].x).toBe(30 * 32);
    expect(byName['fort-core'].y).toBe(11 * 32);
    expect(byName['fort-core'].type).toBe('fort-core');
  });

  it('carves a stone fort footprint at center-east on the ground layer', () => {
    const ground = (m1.layers as Layer[]).find(
      (l) => l.name === 'ground',
    ) as TileLayer;
    const at = (row: number, col: number): number =>
      ground.data[row * ground.width + col];

    // Fort 5x5 at cols 28-32, rows 9-13 — every tile should be stone (gid 3)
    for (let r = 9; r <= 13; r++) {
      for (let c = 28; c <= 32; c++) {
        expect(at(r, c)).toBe(3);
      }
    }

    // Grass (gid 1) everywhere far from paths/fort
    expect(at(0, 0)).toBe(1);

    // Dirt path (gid 2) reaches the western spawn and runs to the fort
    expect(at(11, 0)).toBe(2);
    expect(at(11, 27)).toBe(2);

    // Dirt path (gid 2) reaches the N and S spawns
    expect(at(0, 19)).toBe(2);
    expect(at(0, 20)).toBe(2);
    expect(at(22, 19)).toBe(2);
    expect(at(22, 20)).toBe(2);
  });

  it('forest layer blocks sight but is passable (per layer properties)', () => {
    const forest = (m1.layers as Layer[]).find(
      (l) => l.name === 'forest',
    ) as TileLayer & { properties: { name: string; value: unknown }[] };
    const props = Object.fromEntries(
      (forest.properties ?? []).map((p) => [p.name, p.value]),
    );
    expect(props.blocksSight).toBe(true);
    expect(props.passable).toBe(true);
  });

  it('water layer is impassable (per layer properties)', () => {
    const water = (m1.layers as Layer[]).find(
      (l) => l.name === 'water',
    ) as TileLayer & { properties: { name: string; value: unknown }[] };
    const props = Object.fromEntries(
      (water.properties ?? []).map((p) => [p.name, p.value]),
    );
    expect(props.passable).toBe(false);

    // Coastline on east edge: every row's last two cells should be water (gid 3)
    const w = water.width;
    for (let r = 0; r < water.height; r++) {
      expect(water.data[r * w + (w - 2)]).toBe(3);
      expect(water.data[r * w + (w - 1)]).toBe(3);
    }
  });
});
