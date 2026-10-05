// Moving test subjects and landmark buildings for synthetic vision, anchored to one ground point.

import * as THREE from 'three';

export interface SubjectState {
  id: string;
  /** Metres from the anchor. */
  north: number;
  east: number;
  /** Direction of travel, degrees from North. */
  headingDeg: number;
}

interface Route {
  id: string;
  kind: 'car' | 'van' | 'person';
  color: number;
  at: (tSec: number) => SubjectState;
}

const R2D = 180 / Math.PI;

/** Constant-speed circle, counter-clockwise seen from above. */
function circle(id: string, r: number, speed: number, phase = 0) {
  return (t: number): SubjectState => {
    const a = phase + (speed / r) * t;
    return { id, north: r * Math.cos(a), east: r * Math.sin(a), headingDeg: ((a * R2D + 90) % 360 + 360) % 360 };
  };
}

/** Stadium track: two straights joined by half circles, driven at constant speed. */
function oval(id: string, straight: number, r: number, speed: number) {
  const perim = 2 * straight + 2 * Math.PI * r;
  return (t: number): SubjectState => {
    let s = (speed * t) % perim;
    if (s < straight) return { id, north: -straight / 2 + s, east: r, headingDeg: 0 };
    s -= straight;
    if (s < Math.PI * r) {
      const a = s / r;
      return { id, north: straight / 2 + r * Math.sin(a), east: r * Math.cos(a), headingDeg: ((-a * R2D) % 360 + 360) % 360 };
    }
    s -= Math.PI * r;
    if (s < straight) return { id, north: straight / 2 - s, east: -r, headingDeg: 180 };
    s -= straight;
    const a = s / r;
    return { id, north: -straight / 2 - r * Math.sin(a), east: -r * Math.cos(a), headingDeg: ((180 - a * R2D) % 360 + 360) % 360 };
  };
}

/** Back and forth along a north-south line. */
function pace(id: string, length: number, speed: number, east: number) {
  return (t: number): SubjectState => {
    const s = (speed * t) % (2 * length);
    const out = s < length;
    return { id, north: out ? -length / 2 + s : length / 2 - (s - length), east, headingDeg: out ? 0 : 180 };
  };
}

export const ROUTES: Route[] = [
  { id: 'red-car', kind: 'car', color: 0xd7262e, at: circle('red-car', 40, 8) },
  { id: 'yellow-van', kind: 'van', color: 0xf2c014, at: oval('yellow-van', 120, 25, 12) },
  { id: 'walker', kind: 'person', color: 0x1f6fe0, at: pace('walker', 30, 1.5, -15) },
];

/** Static landmarks: [north, east, width, depth, height]. */
export const BUILDINGS: [number, number, number, number, number][] = [
  [70, 60, 14, 10, 8],
  [-65, -55, 18, 12, 11],
  [10, -80, 10, 10, 15],
];

export function subjectStates(tSec: number): SubjectState[] {
  return ROUTES.map((r) => r.at(tSec));
}

function box(w: number, h: number, d: number, color: number, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  m.position.y = y;
  return m;
}

/** Built facing -z (North when unrotated), sitting on y = 0. */
function makeModel(kind: Route['kind'], color: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'person') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.35, 12), new THREE.MeshStandardMaterial({ color }));
    body.position.y = 0.68;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe0b48a }));
    head.position.y = 1.55;
    g.add(body, head);
    return g;
  }
  const [len, wid, hgt] = kind === 'van' ? [5.2, 2.1, 1.9] : [4.6, 1.9, 0.9];
  g.add(box(wid, hgt, len, color, 0.35 + hgt / 2));
  if (kind === 'car') g.add(box(wid * 0.88, 0.7, len * 0.5, 0x1d2430, 0.35 + hgt + 0.35));
  for (const [x, z] of [[-wid / 2, -len * 0.32], [wid / 2, -len * 0.32], [-wid / 2, len * 0.32], [wid / 2, len * 0.32]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.35, z);
    g.add(wheel);
  }
  return g;
}

export interface SubjectMeshes {
  group: THREE.Group;
  /** Place everything for time t; `toWorld` maps anchor-relative metres to scene x, ground y, z. */
  update: (tSec: number, toWorld: (north: number, east: number) => { x: number; y: number; z: number }) => void;
  dispose: () => void;
}

export function createSubjectMeshes(): SubjectMeshes {
  const group = new THREE.Group();
  const movers = ROUTES.map((r) => ({ route: r, obj: makeModel(r.kind, r.color) }));
  for (const m of movers) group.add(m.obj);
  const buildings = BUILDINGS.map(([n, e, w, d, h]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, 0xd9d4c7, h / 2));
    g.add(box(w + 0.6, 0.6, d + 0.6, 0x7a4b3a, h + 0.3));
    group.add(g);
    return { g, n, e };
  });
  return {
    group,
    update(tSec, toWorld) {
      for (const { route, obj } of movers) {
        const s = route.at(tSec);
        const p = toWorld(s.north, s.east);
        obj.position.set(p.x, p.y, p.z);
        obj.rotation.y = (-s.headingDeg * Math.PI) / 180;
      }
      for (const b of buildings) {
        const p = toWorld(b.n, b.e);
        b.g.position.set(p.x, p.y, p.z);
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}
