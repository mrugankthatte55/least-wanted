import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32, roadTexture, asphaltTexture, concreteTexture, groundTexture, grassTexture, roofTexture, windowTextures } from "./textures";
import { AABB, buildCarMesh, CIVILIAN_COLORS } from "./car";

export interface RoadNode { id: number; i: number; j: number; x: number; z: number; links: number[]; }

export const N = 11;           // intersections per axis
export const SPACING = 96;     // metres between intersections
export const ROAD_W = 16;
export const BLOCK_W = SPACING - ROAD_W;
export const HALF = ((N - 1) / 2) * SPACING; // 480
export const CURB_Y = 0.15;
export const LANES = [2, 6];   // lane centre offsets from the road centre line

type BlockKind = "tower" | "mid" | "low" | "park" | "lot";

export class City {
  group = new THREE.Group();
  colliders: AABB[] = [];
  nodes: RoadNode[] = [];
  blockKinds: BlockKind[][] = [];
  private cells = new Map<number, AABB[]>();
  private readonly CELL = 48;

  nodeAt(i: number, j: number) { return this.nodes[j * N + i]; }

  nearestNode(x: number, z: number): RoadNode {
    const i = Math.max(0, Math.min(N - 1, Math.round((x + HALF) / SPACING)));
    const j = Math.max(0, Math.min(N - 1, Math.round((z + HALF) / SPACING)));
    return this.nodeAt(i, j);
  }

  /** Nodes whose distance from (x,z) is within [min,max]. */
  nodesNear(x: number, z: number, min: number, max: number) {
    return this.nodes.filter((n) => { const d = Math.hypot(n.x - x, n.z - z); return d >= min && d <= max; });
  }

  randomNeighbor(id: number, exclude: number, rng: () => number = Math.random) {
    const n = this.nodes[id];
    const opts = n.links.filter((l) => l !== exclude);
    if (!opts.length) return n.links[0];
    return opts[Math.floor(rng() * opts.length)];
  }

  /** Straight-ahead neighbour if there is one, else a random turn. */
  continueFrom(prev: number, cur: number, straightBias = 0.55, rng: () => number = Math.random) {
    const p = this.nodes[prev], c = this.nodes[cur];
    const di = Math.sign(c.i - p.i), dj = Math.sign(c.j - p.j);
    const si = c.i + di, sj = c.j + dj;
    if (rng() < straightBias && si >= 0 && si < N && sj >= 0 && sj < N) return this.nodeAt(si, sj).id;
    return this.randomNeighbor(cur, prev, rng);
  }

  groundY(x: number, z: number) {
    if (Math.abs(x) > HALF + ROAD_W / 2 || Math.abs(z) > HALF + ROAD_W / 2) return 0;
    const u = (((x + HALF) % SPACING) + SPACING) % SPACING;
    const v = (((z + HALF) % SPACING) + SPACING) % SPACING;
    const onX = u < ROAD_W / 2 || u > SPACING - ROAD_W / 2;
    const onZ = v < ROAD_W / 2 || v > SPACING - ROAD_W / 2;
    return onX || onZ ? 0 : CURB_Y;
  }

  private cellKey(cx: number, cz: number) { return (cx + 512) * 2048 + (cz + 512); }

  addCollider(b: AABB) {
    this.colliders.push(b);
    const x0 = Math.floor((b.minX - 4) / this.CELL), x1 = Math.floor((b.maxX + 4) / this.CELL);
    const z0 = Math.floor((b.minZ - 4) / this.CELL), z1 = Math.floor((b.maxZ + 4) / this.CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this.cellKey(cx, cz);
      let list = this.cells.get(k);
      if (!list) { list = []; this.cells.set(k, list); }
      list.push(b);
    }
  }

  collidersNear(x: number, z: number): AABB[] {
    return this.cells.get(this.cellKey(Math.floor(x / this.CELL), Math.floor(z / this.CELL))) ?? [];
  }

  pointBlocked(x: number, z: number, margin: number) {
    for (const b of this.collidersNear(x, z)) {
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return true;
    }
    return false;
  }
}

// ---------- geometry helpers ----------
class Facades {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  quad(p: number[][], n: number[], uvs: number[][], c: THREE.Color) {
    const base = this.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      this.pos.push(...p[k]); this.nrm.push(...n); this.uv.push(...uvs[k]); this.col.push(c.r, c.g, c.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

function scaledPlane(w: number, h: number, ru: number, rv: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
  g.rotateX(-Math.PI / 2);
  return g;
}

function scaledBox(w: number, h: number, d: number, rep: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i) * rep);
  return g;
}

export function buildCity(): City {
  const city = new City();
  const rng = mulberry32(1337);
  const G = city.group;

  // nodes
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const id = j * N + i;
    const links: number[] = [];
    if (i > 0) links.push(id - 1);
    if (i < N - 1) links.push(id + 1);
    if (j > 0) links.push(id - N);
    if (j < N - 1) links.push(id + N);
    city.nodes.push({ id, i, j, x: (i - (N - 1) / 2) * SPACING, z: (j - (N - 1) / 2) * SPACING, links });
  }

  // ground
  const ground = new THREE.Mesh(scaledPlane(2400, 2400, 150, 150), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  G.add(ground);

  // roads
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.85, metalness: 0.05 });
  const asphalt = asphaltTexture();
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, metalness: 0.05 });
  const roadGeos: THREE.BufferGeometry[] = [];
  const interGeos: THREE.BufferGeometry[] = [];
  const segLen = SPACING - ROAD_W;
  for (const n of city.nodes) {
    const ig = scaledPlane(ROAD_W, ROAD_W, 1, 1);
    ig.translate(n.x, 0.005, n.z);
    interGeos.push(ig);
    if (n.i < N - 1) {
      const g = scaledPlane(segLen, ROAD_W, segLen / ROAD_W, 1);
      g.translate(n.x + SPACING / 2, 0.005, n.z);
      roadGeos.push(g);
    }
    if (n.j < N - 1) {
      const g = scaledPlane(segLen, ROAD_W, segLen / ROAD_W, 1);
      g.rotateY(Math.PI / 2);
      g.translate(n.x, 0.005, n.z + SPACING / 2);
      roadGeos.push(g);
    }
  }
  const roads = new THREE.Mesh(mergeGeometries(roadGeos), roadMat);
  roads.receiveShadow = true;
  G.add(roads);
  const inters = new THREE.Mesh(mergeGeometries(interGeos), asphaltMat);
  inters.receiveShadow = true;
  G.add(inters);

  // blocks
  const win = windowTextures();
  const facadeMat = new THREE.MeshStandardMaterial({ map: win.map, emissiveMap: win.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.75, vertexColors: true, roughness: 0.7, metalness: 0.05 });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.95 });
  const facades = new Facades();
  const roofs = new Facades();
  const concreteGeos: THREE.BufferGeometry[] = [];
  const grassGeos: THREE.BufferGeometry[] = [];
  const lotGeos: THREE.BufferGeometry[] = [];
  const treeMats: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const lampMats: THREE.Matrix4[] = [];
  const parked: { x: number; z: number; h: number; color: number }[] = [];
  const tints = [0xb9b5ad, 0xa89f93, 0x8c8f96, 0x7d6f63, 0x9aa3ad, 0xc7bfae, 0x6f7a86, 0x9c8c7c, 0xb0a48c];

  const addBuilding = (x: number, z: number, w: number, d: number, h: number, tint: number) => {
    const c = new THREE.Color(tint);
    const y0 = CURB_Y, y1 = CURB_Y + h;
    const hw = w / 2, hd = d / 2;
    const ru = Math.max(1, Math.round(w / 4)) / 8, rv = Math.round(h / 4) / 8;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 8) / 8;
    const uvs = (r: number) => [[uo, vo], [uo + r, vo], [uo + r, vo + rv], [uo, vo + rv]];
    facades.quad([[x - hw, y0, z + hd], [x + hw, y0, z + hd], [x + hw, y1, z + hd], [x - hw, y1, z + hd]], [0, 0, 1], uvs(ru), c);
    facades.quad([[x + hw, y0, z - hd], [x - hw, y0, z - hd], [x - hw, y1, z - hd], [x + hw, y1, z - hd]], [0, 0, -1], uvs(ru), c);
    const rd = Math.max(1, Math.round(d / 4)) / 8;
    facades.quad([[x + hw, y0, z + hd], [x + hw, y0, z - hd], [x + hw, y1, z - hd], [x + hw, y1, z + hd]], [1, 0, 0], uvs(rd), c);
    facades.quad([[x - hw, y0, z - hd], [x - hw, y0, z + hd], [x - hw, y1, z + hd], [x - hw, y1, z - hd]], [-1, 0, 0], uvs(rd), c);
    roofs.quad([[x - hw, y1, z + hd], [x + hw, y1, z + hd], [x + hw, y1, z - hd], [x - hw, y1, z - hd]], [0, 1, 0], [[0, 0], [w / 16, 0], [w / 16, d / 16], [0, d / 16]], c);
    city.addCollider({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  };

  for (let bj = 0; bj < N - 1; bj++) {
    city.blockKinds.push([]);
    for (let bi = 0; bi < N - 1; bi++) {
      const bx = (bi - (N - 1) / 2) * SPACING + SPACING / 2;
      const bz = (bj - (N - 1) / 2) * SPACING + SPACING / 2;
      const ring = Math.max(Math.abs(bi - 4.5), Math.abs(bj - 4.5)); // 0.5 .. 4.5
      let kind: BlockKind;
      const r = rng();
      if (ring <= 1.5) kind = r < 0.1 ? "lot" : "tower";
      else if (ring <= 2.5) kind = r < 0.12 ? "park" : r < 0.22 ? "lot" : "mid";
      else kind = r < 0.18 ? "park" : r < 0.26 ? "lot" : "low";
      city.blockKinds[bj].push(kind);

      const slab = scaledBox(BLOCK_W, CURB_Y, BLOCK_W, BLOCK_W / 4);
      slab.translate(bx, CURB_Y / 2, bz);
      (kind === "park" ? grassGeos : kind === "lot" ? lotGeos : concreteGeos).push(slab);

      // lamps at the four corners
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        lampMats.push(new THREE.Matrix4().makeTranslation(bx + sx * (BLOCK_W / 2 - 1.2), 0, bz + sz * (BLOCK_W / 2 - 1.2)));
      }

      if (kind === "park") {
        const count = 10 + Math.floor(rng() * 8);
        for (let t = 0; t < count; t++) {
          const tx = bx + (rng() - 0.5) * (BLOCK_W - 10), tz = bz + (rng() - 0.5) * (BLOCK_W - 10);
          const s = 0.8 + rng() * 0.7;
          treeMats.push(new THREE.Matrix4().compose(new THREE.Vector3(tx, CURB_Y, tz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28), new THREE.Vector3(s, s, s)));
          treeColors.push(new THREE.Color().setHSL(0.25 + rng() * 0.08, 0.5, 0.25 + rng() * 0.15));
        }
        continue;
      }
      if (kind === "lot") {
        for (let k = 0; k < 5; k++) {
          if (rng() < 0.3) continue;
          const px = bx - 24 + k * 12, pz = bz + (rng() < 0.5 ? -14 : 14);
          const h = rng() < 0.5 ? 0 : Math.PI;
          parked.push({ x: px, z: pz, h, color: CIVILIAN_COLORS[Math.floor(rng() * CIVILIAN_COLORS.length)] });
          city.addCollider({ minX: px - 1.0, maxX: px + 1.0, minZ: pz - 2.4, maxZ: pz + 2.4 });
        }
        continue;
      }
      // buildings: split block into a small grid
      const nx = kind === "tower" ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
      const nz = kind === "tower" ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
      const cw = BLOCK_W / nx, cd = BLOCK_W / nz;
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        if (rng() < 0.08) continue; // empty plot
        const inset = 3 + rng() * 3;
        const w = Math.round((cw - inset * 2) / 4) * 4;
        const d = Math.round((cd - inset * 2) / 4) * 4;
        if (w < 8 || d < 8) continue;
        const cx = bx - BLOCK_W / 2 + cw * (ix + 0.5);
        const cz = bz - BLOCK_W / 2 + cd * (iz + 0.5);
        let floors: number;
        if (kind === "tower") floors = 8 + Math.floor(rng() * 18);
        else if (kind === "mid") floors = 3 + Math.floor(rng() * 7);
        else floors = 2 + Math.floor(rng() * 3);
        addBuilding(cx, cz, w, d, floors * 4, tints[Math.floor(rng() * tints.length)]);
      }
    }
  }

  const facadeMesh = new THREE.Mesh(facades.build(), facadeMat);
  facadeMesh.castShadow = true;
  facadeMesh.receiveShadow = true;
  G.add(facadeMesh);
  const roofMesh = new THREE.Mesh(roofs.build(), roofMat);
  roofMesh.receiveShadow = true;
  G.add(roofMesh);

  const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95 });
  const walk = new THREE.Mesh(mergeGeometries(concreteGeos), concreteMat);
  walk.receiveShadow = true;
  G.add(walk);
  if (grassGeos.length) {
    const grass = new THREE.Mesh(mergeGeometries(grassGeos), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
    grass.receiveShadow = true;
    G.add(grass);
  }
  if (lotGeos.length) {
    const lot = new THREE.Mesh(mergeGeometries(lotGeos), asphaltMat);
    lot.receiveShadow = true;
    G.add(lot);
  }

  // trees
  if (treeMats.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 }), treeMats.length);
    const crownGeo = new THREE.IcosahedronGeometry(2.4, 1); crownGeo.scale(1, 1.25, 1); crownGeo.translate(0, 3.9, 0);
    const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), treeMats.length);
    treeMats.forEach((m, i) => { trunk.setMatrixAt(i, m); crown.setMatrixAt(i, m); crown.setColorAt(i, treeColors[i]); });
    trunk.castShadow = crown.castShadow = true;
    crown.receiveShadow = true;
    G.add(trunk, crown);
  }
  // street lamps
  {
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6).translate(0, 3.5 + CURB_Y, 0), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.7 }), lampMats.length);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.22, 0.5).translate(0, 7.1 + CURB_Y, 0), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffd28a, emissiveIntensity: 2.5 }), lampMats.length);
    lampMats.forEach((m, i) => { pole.setMatrixAt(i, m); head.setMatrixAt(i, m); });
    pole.castShadow = true;
    G.add(pole, head);
  }
  // parked cars
  for (const p of parked) {
    const m = buildCarMesh("sedan", p.color);
    m.group.position.set(p.x, CURB_Y, p.z);
    m.group.rotation.y = p.h;
    m.tail.emissiveIntensity = 0;
    G.add(m.group);
  }

  // boundary walls (just outside the outer roads)
  const B = HALF + ROAD_W / 2 + 1;
  city.addCollider({ minX: -B - 20, maxX: -B, minZ: -B - 20, maxZ: B + 20 });
  city.addCollider({ minX: B, maxX: B + 20, minZ: -B - 20, maxZ: B + 20 });
  city.addCollider({ minX: -B - 20, maxX: B + 20, minZ: -B - 20, maxZ: -B });
  city.addCollider({ minX: -B - 20, maxX: B + 20, minZ: B, maxZ: B + 20 });
  {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x777a80, roughness: 0.9 });
    const wg: THREE.BufferGeometry[] = [];
    const L = 2 * B + 2;
    wg.push(new THREE.BoxGeometry(L, 1.2, 1).translate(0, 0.6, -B - 0.5));
    wg.push(new THREE.BoxGeometry(L, 1.2, 1).translate(0, 0.6, B + 0.5));
    wg.push(new THREE.BoxGeometry(1, 1.2, L).translate(-B - 0.5, 0.6, 0));
    wg.push(new THREE.BoxGeometry(1, 1.2, L).translate(B + 0.5, 0.6, 0));
    const wall = new THREE.Mesh(mergeGeometries(wg), wallMat);
    wall.castShadow = true; wall.receiveShadow = true;
    G.add(wall);
  }
  return city;
}
