/**
 * GIS area import - parse survey boundaries out of the files surveyors already
 * have (KML and GeoJSON) so they don't hand-trace polygons on the map.
 *
 * Both formats reduce to the same shape: an outer ring plus optional inner
 * rings (no-fly holes). Coordinates are normalized to {lat, lng}. KMZ is a zip
 * around a KML document; the main process unzips it and hands us the KML text,
 * so this module stays pure (no Node) and unit-testable.
 */

export interface ImportedArea {
  /** Exterior boundary, normalized to {lat, lng}, ring NOT closed (no repeated last point). */
  polygon: Array<{ lat: number; lng: number }>;
  /** Inner rings (no-fly holes), same normalization. */
  holes: Array<Array<{ lat: number; lng: number }>>;
}

export interface ImportedLine {
  /** Ordered path, normalized to {lat, lng}. Never closed. */
  path: Array<{ lat: number; lng: number }>;
  /** Placemark / feature name when the file carries one. */
  name?: string;
}

export type GisFormat = 'kml' | 'geojson';

/** Detect format from a file extension (lower-cased, no dot needed). */
export function gisFormatForExtension(ext: string): GisFormat | null {
  const e = ext.replace(/^\./, '').toLowerCase();
  if (e === 'kml' || e === 'kmz') return 'kml';
  if (e === 'geojson' || e === 'json') return 'geojson';
  return null;
}

/** Drop a trailing point that duplicates the first (closed rings) so editing behaves. */
function openRing(ring: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  if (ring.length > 1) {
    const a = ring[0]!;
    const b = ring[ring.length - 1]!;
    if (a.lat === b.lat && a.lng === b.lng) return ring.slice(0, -1);
  }
  return ring;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// ── GeoJSON ──────────────────────────────────────────────────────────────────

function geoJsonRing(coords: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(coords)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (isValidLatLng(lat, lng)) out.push({ lat, lng });
  }
  return openRing(out);
}

/** Collect every Polygon (as [outer, ...holes][]) from any GeoJSON geometry. */
function geoJsonPolygons(geometry: unknown): unknown[][] {
  if (!geometry || typeof geometry !== 'object') return [];
  const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown };
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) return [g.coordinates];
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) return g.coordinates as unknown[][];
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    return g.geometries.flatMap((sub) => geoJsonPolygons(sub));
  }
  return [];
}

/** Collect every LineString path from any GeoJSON geometry. */
function geoJsonLines(geometry: unknown): unknown[] {
  if (!geometry || typeof geometry !== 'object') return [];
  const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown };
  if (g.type === 'LineString' && Array.isArray(g.coordinates)) return [g.coordinates];
  if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) return g.coordinates as unknown[];
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    return g.geometries.flatMap((sub) => geoJsonLines(sub));
  }
  return [];
}

function geoJsonPath(coords: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(coords)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (isValidLatLng(lat, lng)) out.push({ lat, lng });
  }
  return out;
}

function parseGeoJsonLines(content: string): ImportedLine[] {
  const root = JSON.parse(content) as unknown;
  const features: Array<{ geometry: unknown; name?: string }> = [];
  const r = root as { type?: string; features?: unknown; geometry?: unknown };
  const nameOf = (f: unknown): string | undefined => {
    const props = (f as { properties?: Record<string, unknown> }).properties;
    const n = props?.name ?? props?.Name ?? props?.NAME;
    return typeof n === 'string' && n.trim() ? n.trim() : undefined;
  };
  if (r.type === 'FeatureCollection' && Array.isArray(r.features)) {
    for (const f of r.features) {
      const geom = (f as { geometry?: unknown }).geometry;
      if (geom) features.push({ geometry: geom, name: nameOf(f) });
    }
  } else if (r.type === 'Feature' && r.geometry) {
    features.push({ geometry: r.geometry, name: nameOf(root) });
  } else {
    features.push({ geometry: root });
  }

  const lines: ImportedLine[] = [];
  for (const f of features) {
    for (const coords of geoJsonLines(f.geometry)) {
      const path = geoJsonPath(coords);
      if (path.length >= 2) lines.push(f.name ? { path, name: f.name } : { path });
    }
  }
  if (lines.length > 0) return lines;

  // Same fallback as KML: a pylon-per-feature export carries no line geometry.
  const points: NamedPoint[] = [];
  for (const f of features) {
    for (const p of geoJsonPoints(f.geometry)) {
      points.push(f.name ? { ...p, name: f.name } : p);
    }
  }
  return pointsToLines(points);
}

/** Collect every Point / MultiPoint position from any GeoJSON geometry. */
function geoJsonPoints(geometry: unknown): NamedPoint[] {
  if (!geometry || typeof geometry !== 'object') return [];
  const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown };
  const one = (pt: unknown): NamedPoint | null => {
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    return isValidLatLng(lat, lng) ? { lat, lng } : null;
  };
  if (g.type === 'Point') {
    const p = one(g.coordinates);
    return p ? [p] : [];
  }
  if (g.type === 'MultiPoint' && Array.isArray(g.coordinates)) {
    return g.coordinates.map(one).filter((p): p is NamedPoint => p !== null);
  }
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    return g.geometries.flatMap((sub) => geoJsonPoints(sub));
  }
  return [];
}

function parseGeoJson(content: string): ImportedArea[] {
  const root = JSON.parse(content) as unknown;
  const geometries: unknown[] = [];
  const r = root as { type?: string; features?: unknown; geometry?: unknown };
  if (r.type === 'FeatureCollection' && Array.isArray(r.features)) {
    for (const f of r.features) {
      const geom = (f as { geometry?: unknown }).geometry;
      if (geom) geometries.push(geom);
    }
  } else if (r.type === 'Feature' && r.geometry) {
    geometries.push(r.geometry);
  } else {
    geometries.push(root);
  }

  const areas: ImportedArea[] = [];
  for (const geom of geometries) {
    for (const polygon of geoJsonPolygons(geom)) {
      if (!Array.isArray(polygon) || polygon.length === 0) continue;
      const outer = geoJsonRing(polygon[0]);
      if (outer.length < 3) continue;
      const holes = polygon.slice(1).map(geoJsonRing).filter((h) => h.length >= 3);
      areas.push({ polygon: outer, holes });
    }
  }
  return areas;
}

// ── KML ──────────────────────────────────────────────────────────────────────

/** Parse a KML <coordinates> blob: whitespace-separated "lng,lat[,alt]" tuples. */
function kmlCoordinates(blob: string): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = [];
  for (const tuple of blob.trim().split(/\s+/)) {
    if (!tuple) continue;
    const parts = tuple.split(',');
    if (parts.length < 2) continue;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (isValidLatLng(lat, lng)) out.push({ lat, lng });
  }
  return openRing(out);
}

/**
 * Get the text content of the first child element matching a local name,
 * searched within a parent element. Namespace-agnostic: compares localName
 * so "kml:coordinates" and "coordinates" both match "coordinates".
 */
function firstChildText(parent: Element, localName: string): string | null {
  const nodes = parent.getElementsByTagName(localName);
  // getElementsByTagName with an unqualified name matches across all namespaces
  // in both the browser and @xmldom/xmldom.
  if (nodes.length > 0 && nodes[0] != null) {
    return nodes[0].textContent ?? null;
  }
  // Fallback: iterate children by localName for edge cases where prefixed tags
  // might not be matched by the unqualified name.
  const stack: Element[] = [parent];
  while (stack.length > 0) {
    const el = stack.pop()!;
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child && child.nodeType === 1 /* ELEMENT_NODE */) {
        const elem = child as Element;
        if (elem.localName === localName) return elem.textContent ?? null;
        stack.push(elem);
      }
    }
  }
  return null;
}

/**
 * Extract an outer ring from a Polygon element's outerBoundaryIs > LinearRing > coordinates.
 * Returns null if not found or fewer than 3 points.
 */
function extractOuterRing(polygon: Element): Array<{ lat: number; lng: number }> | null {
  // getElementsByTagName is namespace-agnostic in both browser and xmldom -
  // it matches on the local part of the tag name, ignoring any prefix.
  const outerEls = polygon.getElementsByTagName('outerBoundaryIs');
  if (outerEls.length === 0 || outerEls[0] == null) return null;
  const coordText = firstChildText(outerEls[0], 'coordinates');
  if (!coordText) return null;
  const ring = kmlCoordinates(coordText);
  return ring.length >= 3 ? ring : null;
}

/** Extract all inner (hole) rings from a Polygon element. */
function extractHoles(polygon: Element): Array<Array<{ lat: number; lng: number }>> {
  const holes: Array<Array<{ lat: number; lng: number }>> = [];
  const innerEls = polygon.getElementsByTagName('innerBoundaryIs');
  for (let i = 0; i < innerEls.length; i++) {
    const inner = innerEls[i];
    if (!inner) continue;
    const coordText = firstChildText(inner, 'coordinates');
    if (!coordText) continue;
    const ring = kmlCoordinates(coordText);
    if (ring.length >= 3) holes.push(ring);
  }
  return holes;
}

function parseKml(content: string): ImportedArea[] {
  // Use DOMParser to parse XML. In the browser renderer this is the native
  // global. In the test environment, a compatible DOMParser is set as a global
  // by the test setup (using @xmldom/xmldom which is already installed).
  const parser = new DOMParser();
  let doc: Document;
  try {
    doc = parser.parseFromString(content, 'application/xml');
  } catch (e) {
    // Some DOMParser implementations (e.g. @xmldom/xmldom with errorHandler)
    // throw on fatal parse errors instead of embedding a <parsererror> element.
    throw new Error(`Invalid KML: could not parse XML (${(e as Error).message ?? e})`);
  }

  // In the browser, a parse failure produces a document whose root is
  // <parsererror> rather than the expected element. Detect and reject it.
  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors.length > 0) {
    throw new Error('Invalid KML: could not parse XML');
  }

  // Collect all <Polygon> elements anywhere in the document, including inside
  // <MultiGeometry>, <Placemark>, <Folder>, etc. getElementsByTagName with an
  // unqualified name matches regardless of namespace prefix (both browser and
  // @xmldom/xmldom), so "kml:Polygon" is also matched.
  const polygonEls = doc.getElementsByTagName('Polygon');
  const areas: ImportedArea[] = [];

  for (let i = 0; i < polygonEls.length; i++) {
    const polygon = polygonEls[i];
    if (!polygon) continue;
    const outer = extractOuterRing(polygon);
    if (!outer) continue;
    const holes = extractHoles(polygon);
    areas.push({ polygon: outer, holes });
  }

  return areas;
}

/** Nearest enclosing Placemark's <name>, so imported lines keep their labels. */
function placemarkName(el: Element): string | undefined {
  let node: Element | null = el;
  while (node) {
    if (node.localName === 'Placemark') {
      const n = firstChildText(node, 'name');
      return n && n.trim() ? n.trim() : undefined;
    }
    node = node.parentNode as Element | null;
  }
  return undefined;
}

/**
 * Chain scattered points into polylines.
 *
 * Utilities publish a power line as one Placemark per pylon, with no
 * LineString anywhere, and in no useful document order (the sample that
 * prompted this runs 46, 47, 48, 45, 51...). The points do lie along a path,
 * so a nearest-neighbour walk recovers it: on that file the result matches the
 * utility's own mast numbering exactly, end to end.
 *
 * Two stages, because geometry alone is not enough. Chaining every point in
 * that file welds the main line to four unrelated marker clusters that happen
 * to pass nearby, so points are grouped by name first (digits replaced, so
 * "Mast 46_337" and "Mast 47_337" share a group) and chained within a group.
 * A run then breaks wherever a hop dwarfs the group's typical spacing, which
 * separates clusters that share a naming scheme.
 */
const POINT_CHAIN_MAX = 2000;
const POINT_CHAIN_BREAK_FACTOR = 3;
const POINT_CHAIN_MIN_BREAK_M = 200;

interface NamedPoint {
  lat: number;
  lng: number;
  name?: string;
}

/** Equirectangular metres; the distances compared here are local. */
function approxMetres(a: NamedPoint, b: NamedPoint): number {
  const latM = (a.lat - b.lat) * 110_540;
  const lngM = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(latM, lngM);
}

/** "Mast 46_337" and "Mast 47_337" share a stem; "P3" and "P4" do not split. */
function nameStem(name: string | undefined): string {
  if (!name) return '';
  return name.replace(/\s+/g, '').replace(/\d+/, '#');
}

/** Greedy nearest-neighbour order, seeded from an end of the run. */
function chainOrder(points: NamedPoint[]): number[] {
  const sweep = (seed: number): number[] => {
    const order = [seed];
    const left = new Set(points.map((_, i) => i));
    left.delete(seed);
    while (left.size > 0) {
      const cur = points[order[order.length - 1]!]!;
      let best = -1;
      let bestD = Infinity;
      for (const i of left) {
        const dd = approxMetres(cur, points[i]!);
        if (dd < bestD) { bestD = dd; best = i; }
      }
      if (best < 0) break;
      order.push(best);
      left.delete(best);
    }
    return order;
  };
  // Double sweep: the farthest point from an arbitrary start is an end of the
  // run, so the second pass walks the path instead of starting in its middle.
  return sweep(sweep(0)[points.length - 1] ?? 0);
}

function pointsToLines(points: NamedPoint[]): ImportedLine[] {
  if (points.length < 2 || points.length > POINT_CHAIN_MAX) return [];

  const groups = new Map<string, NamedPoint[]>();
  for (const p of points) {
    const key = nameStem(p.name);
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const lines: ImportedLine[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const order = chainOrder(group);
    const hops: number[] = [];
    for (let i = 0; i < order.length - 1; i++) {
      hops.push(approxMetres(group[order[i]!]!, group[order[i + 1]!]!));
    }
    const sorted = [...hops].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const breakAt = Math.max(POINT_CHAIN_BREAK_FACTOR * median, POINT_CHAIN_MIN_BREAK_M);

    let run: NamedPoint[] = [group[order[0]!]!];
    const flush = () => {
      if (run.length < 2) return;
      const name = run[0]?.name;
      const path = run.map((p) => ({ lat: p.lat, lng: p.lng }));
      lines.push(name ? { path, name } : { path });
    };
    for (let i = 0; i < hops.length; i++) {
      if (hops[i]! > breakAt) { flush(); run = []; }
      run.push(group[order[i + 1]!]!);
    }
    flush();
  }
  return lines;
}

/** Standalone <Point> placemarks, for files that carry no line geometry. */
function kmlPoints(doc: Document): NamedPoint[] {
  const out: NamedPoint[] = [];
  const els = doc.getElementsByTagName('Point');
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el) continue;
    const coordText = firstChildText(el, 'coordinates');
    if (!coordText) continue;
    const parts = coordText.trim().split(',');
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!isValidLatLng(lat, lng)) continue;
    const name = placemarkName(el);
    out.push(name ? { lat, lng, name } : { lat, lng });
  }
  return out;
}

function parseKmlLines(content: string): ImportedLine[] {
  const parser = new DOMParser();
  let doc: Document;
  try {
    doc = parser.parseFromString(content, 'application/xml');
  } catch {
    return [];
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return [];

  const lines: ImportedLine[] = [];
  const els = doc.getElementsByTagName('LineString');
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el) continue;
    const coordText = firstChildText(el, 'coordinates');
    if (!coordText) continue;
    const path: Array<{ lat: number; lng: number }> = [];
    for (const tuple of coordText.trim().split(/\s+/)) {
      const parts = tuple.split(',');
      if (parts.length < 2) continue;
      const lng = Number(parts[0]);
      const lat = Number(parts[1]);
      if (isValidLatLng(lat, lng)) path.push({ lat, lng });
    }
    if (path.length < 2) continue;
    const name = placemarkName(el);
    lines.push(name ? { path, name } : { path });
  }
  // Only when the file draws no lines of its own: a survey with real
  // LineStrings plus a few markers must not gain phantom centrelines.
  if (lines.length === 0) return pointsToLines(kmlPoints(doc));
  return lines;
}

/**
 * Parse a GIS boundary file into one or more areas. Returns [] when nothing
 * usable is found (callers should surface a friendly error rather than crash).
 */
export function parseGisArea(content: string, format: GisFormat): ImportedArea[] {
  try {
    return format === 'geojson' ? parseGeoJson(content) : parseKml(content);
  } catch {
    return [];
  }
}

/**
 * Parse line geometry (LineString / MultiLineString) out of the same file.
 * Separate from `parseGisArea` so a mixed file yields both, and so an import
 * can offer a road or power line as a corridor centerline.
 */
export function parseGisLines(content: string, format: GisFormat): ImportedLine[] {
  try {
    return format === 'geojson' ? parseGeoJsonLines(content) : parseKmlLines(content);
  } catch {
    return [];
  }
}
