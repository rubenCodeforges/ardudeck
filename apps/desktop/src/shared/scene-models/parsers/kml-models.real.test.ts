// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as THREE from 'three';
import proj4 from 'proj4';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { parseKmlModels } from './kml-models';
import { modelQuaternion, offsetLatLng } from '../../../renderer/three/scene-model-placement';
import type { KmlModel } from './types';

type P = [number, number];
const DEG = Math.PI / 180;

/** A flat COLLADA (SketchUp style: inches, Z_UP) holding one polygon as a triangle fan, in model units. */
function flatCollada(ring: P[]): string {
  const pos = ring.flatMap(([x, y]) => [x, y, 0]).join(' ');
  const tris = ring.slice(2).flatMap((_, i) => [0, i + 1, i + 2]).join(' ');
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="inch" meter="0.0254"/><up_axis>Z_UP</up_axis></asset>
<library_geometries><geometry id="g"><mesh>
<source id="p"><float_array id="pa" count="${ring.length * 3}">${pos}</float_array>
<technique_common><accessor source="#pa" count="${ring.length}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>
<triangles count="${ring.length - 2}"><input semantic="VERTEX" source="#v" offset="0"/><p>${tris}</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#g"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`;
}

/** Load through ColladaLoader as the renderer does, orient with the placement, return each vertex as [east, north] metres. */
function placeCollada(dae: string, m: KmlModel): P[] {
  const orient = new THREE.Group();
  orient.add(new ColladaLoader().parse(dae, '').scene);
  orient.quaternion.copy(modelQuaternion(m.placement.yawDeg, m.placement.pitchDeg, m.placement.rollDeg));
  orient.scale.setScalar(m.placement.scale);
  orient.updateMatrixWorld(true);
  const out: P[] = [];
  const v = new THREE.Vector3();
  orient.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const a = mesh.geometry.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld);
      out.push([v.x, -v.z]);
    }
  });
  return out;
}

const M_LAT = 111_320;
const toLocal = (o: { lat: number; lng: number }, [lat, lng]: P): P => [(lng - o.lng) * M_LAT * Math.cos(o.lat * DEG), (lat - o.lat) * M_LAT];

function hull(pts: P[]): P[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P[] = [], up: P[] = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (const q of s.reverse()) { while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function inside(r: P[], [x, y]: P): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!, [xj, yj] = r[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Area overlap, centroid distance and long-axis bearing (degrees from north, 0..180) of two rings, on a 0.25 m grid. */
function compare(a: P[], b: P[]) {
  const all = [...a, ...b];
  const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const acc = (r: P[]) => ({ r, n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 });
  const A = acc(a), B = acc(b);
  let both = 0, either = 0;
  for (let x = x0; x <= x1; x += 0.25) for (let y = y0; y <= y1; y += 0.25) {
    const ia = inside(a, [x, y]), ib = inside(b, [x, y]);
    if (ia && ib) both++;
    if (ia || ib) either++;
    for (const [s, hit] of [[A, ia], [B, ib]] as const) if (hit) { s.n++; s.sx += x; s.sy += y; s.sxx += x * x; s.syy += y * y; s.sxy += x * y; }
  }
  const stats = (s: typeof A) => {
    const cx = s.sx / s.n, cy = s.sy / s.n;
    const vxx = s.sxx / s.n - cx * cx, vyy = s.syy / s.n - cy * cy, vxy = s.sxy / s.n - cx * cy;
    return { cx, cy, axis: (((0.5 * Math.atan2(2 * vxy, vyy - vxx)) / DEG) + 180) % 180 };
  };
  const sa = stats(A), sb = stats(B);
  const d = Math.abs(sa.axis - sb.axis);
  return { iou: both / either, centroidM: Math.hypot(sa.cx - sb.cx, sa.cy - sb.cy), axisA: sa.axis, axisB: sb.axis, axisDiff: Math.min(d, 180 - d) };
}

describe('Macky Auditorium, Google KML Models tutorial sample', () => {
  const kml = readFileSync(join(__dirname, '../__fixtures__/macky-doc.kml'), 'utf-8');
  const [model] = parseKmlModels(kml);

  it('reads Location, altitudeMode, Orientation and Scale exactly', () => {
    expect(model).toEqual({
      href: 'files/CU Macky.dae',
      name: 'SketchUp Model of Macky Auditorium',
      placement: { lat: 40.009993372683, lng: -105.272774533734, alt: 0, altitudeMode: 'agl', yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1 },
    });
  });

  // Hull of every vertex of "files/CU Macky.dae" in MackyBldg.kmz, model inches, Z_UP
  const MODEL_HULL: P[] = [[-1254, -509], [-1254, -540], [-1243, -1282], [-1242, -1349], [-1162, -1348], [1411, -1309], [1491, -1308],
    [1490, -1241], [1479, -499], [1478, -468], [782, 1400], [717, 1462], [688, 1462], [-557, 1443], [-620, 1379]];
  // OSM way 46146360 "Macky Auditorium", (c) OpenStreetMap contributors, ODbL
  const OSM: P[] = [[40.0098921, -105.272599], [40.0102768, -105.2725988], [40.010287, -105.2725845], [40.0103009, -105.2725838],
    [40.0103106, -105.2725954], [40.0103112, -105.2726122], [40.0103029, -105.2726261], [40.0102911, -105.2726261], [40.0102925, -105.2729053],
    [40.0103039, -105.2729051], [40.0103126, -105.272915], [40.0103127, -105.2729333], [40.0103034, -105.2729468], [40.0102908, -105.2729463],
    [40.0102818, -105.2729315], [40.0100856, -105.2729295], [40.0098914, -105.2729289], [40.0098934, -105.2731655], [40.0097995, -105.273165],
    [40.0097792, -105.2731654], [40.0097586, -105.273165], [40.0097063, -105.2731622], [40.0097075, -105.2730024], [40.0097564, -105.2730025],
    [40.0097568, -105.2727744], [40.0097572, -105.2725227], [40.0097072, -105.2725226], [40.009708, -105.2723665], [40.0098907, -105.272367]];

  const origin = { lat: model!.placement.lat, lng: model!.placement.lng };
  const osmHull = hull(OSM.map((p) => toLocal(origin, p)));
  const footprint = (m: KmlModel) => {
    const pts = placeCollada(flatCollada(MODEL_HULL), m).map(([e, n]) => offsetLatLng(origin, e, n));
    return hull(pts.map((p) => toLocal(origin, [p.lat, p.lng])));
  };

  it('lands on the real building footprint with the same orientation', () => {
    const r = compare(footprint(model!), osmHull);
    expect(r.axisDiff).toBeLessThan(3);
    expect(r.centroidM).toBeLessThan(3);
    expect(r.iou).toBeGreaterThan(0.85);
  });

  it('a north-south mirror or a quarter turn fits far worse; the near-symmetric east-west mirror only slightly', () => {
    const ok = compare(footprint(model!), osmHull).iou;
    const mirrored = (sx: number, sy: number) => compare(hull(osmHull.map(([e, n]) => [e * sx, n * sy] as P)), footprint(model!)).iou;
    const turned = compare(footprint({ ...model!, placement: { ...model!.placement, yawDeg: 90 } }), osmHull);
    expect(mirrored(1, -1)).toBeLessThan(ok - 0.1);
    expect(mirrored(-1, 1)).toBeLessThan(ok - 0.02);
    expect(turned.iou).toBeLessThan(ok - 0.1);
  });
});

describe('Pont de Recouvrance, Brest: SketchUp KMZ with a non-zero heading', () => {
  // Model block of terre-virtuelle/navisu navisu-launcher/data/stl/kmz/buildings/pontRecouvrance/doc.kml (unlicensed: numbers only)
  const KML = `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Model</name><Model><altitudeMode>relativeToGround</altitudeMode>
<Location><latitude>48.38434489949</latitude><longitude>-4.496240615845</longitude><altitude>0</altitude></Location>
<Orientation><heading>358.881127942</heading><tilt>0</tilt><roll>0</roll></Orientation>
<Scale><x>1</x><y>1</y><z>1</z></Scale><Link><href>models/untitled.dae</href></Link></Model></Placemark></kml>`;
  const [model] = parseKmlModels(KML);
  const o = model!.placement;

  it('its heading is the UTM zone 30N grid convergence there, so the model axes are grid axes and heading turns them clockwise', () => {
    const utm = proj4('EPSG:4326', '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs');
    const [x, y] = utm.forward([o.lng, o.lat]);
    const [lng2, lat2] = utm.inverse([x!, y! + 1000]);
    const gridNorth = (Math.atan2((lng2! - o.lng) * Math.cos(o.lat * DEG), lat2! - o.lat) / DEG + 360) % 360;
    // the model's +Y (grid north) after our placement
    const n = new THREE.Vector3(0, 0, -1).applyQuaternion(modelQuaternion(o.yawDeg, o.pitchDeg, o.rollDeg));
    const placedNorth = (Math.atan2(n.x, -n.z) / DEG + 360) % 360;
    expect(Math.abs(placedNorth - gridNorth)).toBeLessThan(0.01);
  });

  it('the lifting deck lines up with the bridge in OpenStreetMap', () => {
    // The two 85.9 m deck edges of its models/untitled.dae, model inches, Z_UP
    const deck: P[] = [[-1693, -519], [1685, -353], [1621, 247], [-1757, 81]];
    const seen = new Set<string>();
    const pts = placeCollada(flatCollada(deck), model!).filter((p) => {
      const k = p.map((v) => v.toFixed(3)).join();
      return seen.has(k) ? false : (seen.add(k), true);
    });
    const bearing = (a: P, b: P) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) / DEG) + 360) % 180;
    const placed = (bearing(pts[0]!, pts[1]!) + bearing(pts[3]!, pts[2]!)) / 2;
    // OSM ways 1423115033 and 1423115034, the movable span, (c) OpenStreetMap contributors, ODbL
    const a = toLocal(o, [48.3844028, -4.4956212]), b = toLocal(o, [48.3842982, -4.4969074]);
    const c = toLocal(o, [48.3842794, -4.4969038]), d = toLocal(o, [48.3843844, -4.4956168]);
    const osm = (bearing(b, a) + bearing(c, d)) / 2;
    expect(Math.abs(placed - osm)).toBeLessThan(3.5);
  });
});

describe('tilt and roll (spec-derived, no ground truth)', () => {
  // NASA WorldWind Java KMLModelPlacemarkImpl + ColladaRoot.getMatrix(): ENU rotation Rz(360 - heading) Rx(-tilt) Ry(-roll)
  const rx = (a: number) => new THREE.Matrix4().makeRotationX(a);
  const ry = (a: number) => new THREE.Matrix4().makeRotationY(a);
  const rz = (a: number) => new THREE.Matrix4().makeRotationZ(a);
  const ENU_TO_LOCAL = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

  it('parser plus placement equal WorldWind for any heading, tilt and roll', () => {
    for (const [h, t, r] of [[0, 30, 0], [0, 0, 30], [40, 25, -15], [200, -60, 70], [315, 80, 170]] as const) {
      const kml = `<kml><Placemark><Model><Location><longitude>0</longitude><latitude>0</latitude></Location>
<Orientation><heading>${h}</heading><tilt>${t}</tilt><roll>${r}</roll></Orientation><Link><href>m.dae</href></Link></Model></Placemark></kml>`;
      const p = parseKmlModels(kml)[0]!.placement;
      const ours = new THREE.Matrix4().makeRotationFromQuaternion(modelQuaternion(p.yawDeg, p.pitchDeg, p.rollDeg));
      const ww = rz((360 - h) * DEG).multiply(rx(-t * DEG)).multiply(ry(-r * DEG));
      const wwLocal = ENU_TO_LOCAL.clone().multiply(ww).multiply(ENU_TO_LOCAL.clone().invert());
      for (let i = 0; i < 16; i++) expect(ours.elements[i]).toBeCloseTo(wwLocal.elements[i]!, 9);
    }
  });

  it('positive tilt pitches the model nose (+Y) down, positive roll lifts its right side (+X)', () => {
    const kml = (t: number, r: number) => `<kml><Placemark><Model><Location><longitude>0</longitude><latitude>0</latitude></Location>
<Orientation><heading>0</heading><tilt>${t}</tilt><roll>${r}</roll></Orientation><Link><href>m.dae</href></Link></Model></Placemark></kml>`;
    const q = (t: number, r: number) => { const p = parseKmlModels(kml(t, r))[0]!.placement; return modelQuaternion(p.yawDeg, p.pitchDeg, p.rollDeg); };
    expect(new THREE.Vector3(0, 0, -1).applyQuaternion(q(30, 0)).y).toBeCloseTo(-0.5, 9);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(q(0, 30)).y).toBeCloseTo(0.5, 9);
  });
});
