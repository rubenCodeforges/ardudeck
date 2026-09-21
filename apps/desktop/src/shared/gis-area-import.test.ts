/**
 * Tests for gis-area-import. Runs in the default vitest Node environment.
 * DOMParser is polyfilled below using @xmldom/xmldom (already a transitive
 * dependency of the monorepo) so no new packages are required.
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { parseGisArea, parseGisLines, gisFormatForExtension } from './gis-area-import';

// Polyfill DOMParser for Node test environment.
// @xmldom/xmldom is already installed as a transitive dep of the monorepo.
// We configure it to throw on fatal errors, which lets parseKml surface a
// useful message via the try/catch it already wraps around parseFromString.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMParser = class ThrowingDOMParser {
    parseFromString(content: string, mimeType: string): Document {
      let parseError: Error | null = null;
      const parser = new XmldomParser({
        errorHandler: {
          warning: () => {
            // ignore warnings
          },
          error: (msg: string) => {
            parseError = new Error(msg);
          },
          fatalError: (msg: string) => {
            parseError = new Error(msg);
          },
        },
      });
      const doc = parser.parseFromString(content, mimeType as 'application/xml');
      if (parseError !== null) {
        throw parseError;
      }
      return doc as unknown as Document;
    }
  };
});

describe('gisFormatForExtension', () => {
  it('maps extensions to formats', () => {
    expect(gisFormatForExtension('kml')).toBe('kml');
    expect(gisFormatForExtension('.kmz')).toBe('kml');
    expect(gisFormatForExtension('GeoJSON')).toBe('geojson');
    expect(gisFormatForExtension('json')).toBe('geojson');
    expect(gisFormatForExtension('csv')).toBeNull();
  });
});

describe('parseGisArea - GeoJSON', () => {
  it('reads a Polygon feature with a hole', () => {
    const gj = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [[10, 0], [11, 0], [11, 1], [10, 1], [10, 0]], // outer (closed)
              [[10.2, 0.2], [10.8, 0.2], [10.8, 0.8], [10.2, 0.2]], // hole
            ],
          },
        },
      ],
    });
    const areas = parseGisArea(gj, 'geojson');
    expect(areas).toHaveLength(1);
    // Closing point dropped -> 4 unique vertices.
    expect(areas[0]!.polygon).toHaveLength(4);
    expect(areas[0]!.polygon[0]).toEqual({ lat: 0, lng: 10 });
    expect(areas[0]!.holes).toHaveLength(1);
  });

  it('reads MultiPolygon as multiple areas', () => {
    const gj = JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [1, 0], [1, 1]]],
          [[[5, 5], [6, 5], [6, 6]]],
        ],
      },
    });
    const areas = parseGisArea(gj, 'geojson');
    expect(areas).toHaveLength(2);
  });

  it('returns [] on garbage', () => {
    expect(parseGisArea('not json', 'geojson')).toEqual([]);
  });
});

describe('parseGisArea - KML', () => {
  it('reads a Polygon with outer + inner boundary (no namespace)', () => {
    const kml = `<?xml version="1.0"?><kml><Placemark><Polygon>
      <outerBoundaryIs><LinearRing><coordinates>
        10,0,0 11,0,0 11,1,0 10,1,0 10,0,0
      </coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>
        10.2,0.2 10.8,0.2 10.8,0.8 10.2,0.2
      </coordinates></LinearRing></innerBoundaryIs>
    </Polygon></Placemark></kml>`;
    const areas = parseGisArea(kml, 'kml');
    expect(areas).toHaveLength(1);
    expect(areas[0]!.polygon).toHaveLength(4);
    expect(areas[0]!.polygon[0]).toEqual({ lat: 0, lng: 10 });
    expect(areas[0]!.holes).toHaveLength(1);
  });

  it('skips degenerate polygons', () => {
    const kml = `<kml><Polygon><outerBoundaryIs><LinearRing><coordinates>10,0 11,0</coordinates></LinearRing></outerBoundaryIs></Polygon></kml>`;
    expect(parseGisArea(kml, 'kml')).toEqual([]);
  });

  it('reads a namespaced KML with one polygon and two holes', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>10,0,0 11,0,0 11,1,0 10,1,0 10,0,0</coordinates>
        </LinearRing>
      </outerBoundaryIs>
      <innerBoundaryIs>
        <LinearRing>
          <coordinates>10.1,0.1 10.4,0.1 10.4,0.4 10.1,0.1</coordinates>
        </LinearRing>
      </innerBoundaryIs>
      <innerBoundaryIs>
        <LinearRing>
          <coordinates>10.5,0.5 10.9,0.5 10.9,0.9 10.5,0.5</coordinates>
        </LinearRing>
      </innerBoundaryIs>
    </Polygon>
  </Placemark>
</kml>`;
    const areas = parseGisArea(kml, 'kml');
    expect(areas).toHaveLength(1);
    // outer ring was closed (last == first), so 4 points after dedup
    expect(areas[0]!.polygon).toHaveLength(4);
    expect(areas[0]!.polygon[0]).toEqual({ lat: 0, lng: 10 });
    expect(areas[0]!.holes).toHaveLength(2);
    expect(areas[0]!.holes[0]).toHaveLength(3);
    expect(areas[0]!.holes[1]).toHaveLength(3);
  });

  it('reads a MultiGeometry with two polygons', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <MultiGeometry>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>0,0 1,0 1,1 0,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>5,5 6,5 6,6 5,5</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </MultiGeometry>
  </Placemark>
</kml>`;
    const areas = parseGisArea(kml, 'kml');
    expect(areas).toHaveLength(2);
    expect(areas[0]!.polygon[0]).toEqual({ lat: 0, lng: 0 });
    expect(areas[1]!.polygon[0]).toEqual({ lat: 5, lng: 5 });
  });

  it('deduplicates closed-ring last point', () => {
    // Ring where last point == first; must be stripped to open ring
    const kml = `<?xml version="1.0"?>
<kml>
  <Polygon>
    <outerBoundaryIs>
      <LinearRing>
        <coordinates>20,10,0 21,10,0 21,11,0 20,11,0 20,10,0</coordinates>
      </LinearRing>
    </outerBoundaryIs>
  </Polygon>
</kml>`;
    const areas = parseGisArea(kml, 'kml');
    expect(areas).toHaveLength(1);
    const ring = areas[0]!.polygon;
    // 5 tuples in source; last == first, so 4 after openRing
    expect(ring).toHaveLength(4);
    // first and last must NOT be equal after opening
    expect(ring[0]).not.toEqual(ring[ring.length - 1]);
  });

  it('returns [] on malformed XML', () => {
    // parseGisArea catches the internal throw and returns []
    const bad = `<kml><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,0 1,1</coordinates></WRONG>`;
    expect(parseGisArea(bad, 'kml')).toEqual([]);
  });
});

describe('line-only KML from the field', () => {
  // A powerline/pipeline axis export: one Placemark, one LineString, no
  // polygon. This used to be rejected by the survey import.
  const LEITUNGSACHSE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
	<name>Leitungsachse.kml</name>
	<Placemark>
		<styleUrl>#style62</styleUrl>
		<ExtendedData><SchemaData schemaUrl="#S_x"><SimpleData name="LAYER">Achse</SimpleData></SchemaData></ExtendedData>
		<LineString>
			<coordinates>
				9.070184334257485,53.56601363043846,0 9.099981572850497,53.5733788493523,0 9.105222517649164,53.57224321553907,0 9.11863632958033,53.56933540233313,0
			</coordinates>
		</LineString>
	</Placemark>
</Document>
</kml>`;

  it('yields the line and no areas', () => {
    expect(parseGisArea(LEITUNGSACHSE, 'kml')).toEqual([]);
    const lines = parseGisLines(LEITUNGSACHSE, 'kml');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.path).toHaveLength(4);
    expect(lines[0]!.path[0]!.lat).toBeCloseTo(53.56601363, 6);
    expect(lines[0]!.path[0]!.lng).toBeCloseTo(9.07018433, 6);
  });
});

describe('parseGisLines', () => {
  it('reads a GeoJSON LineString with its feature name', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'B73 north' },
        geometry: { type: 'LineString', coordinates: [[9.7, 53.4], [9.8, 53.45], [9.9, 53.5]] },
      }],
    });
    const lines = parseGisLines(geojson, 'geojson');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.name).toBe('B73 north');
    expect(lines[0]!.path).toHaveLength(3);
    expect(lines[0]!.path[0]).toEqual({ lat: 53.4, lng: 9.7 });
  });

  it('splits a MultiLineString into one line per part', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [[9.7, 53.4], [9.8, 53.45]],
          [[10.0, 53.6], [10.1, 53.65], [10.2, 53.7]],
        ],
      },
    });
    const lines = parseGisLines(geojson, 'geojson');
    expect(lines.map((l) => l.path.length)).toEqual([2, 3]);
  });

  it('reads KML LineStrings and takes the Placemark name', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>Power line A</name><LineString><coordinates>
          9.7,53.4,0 9.8,53.45,0 9.9,53.5,0
        </coordinates></LineString></Placemark>
      </Document></kml>`;
    const lines = parseGisLines(kml, 'kml');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.name).toBe('Power line A');
    expect(lines[0]!.path).toHaveLength(3);
  });

  it('ignores polygons, and parseGisArea ignores lines', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
          9.7,53.4 9.8,53.4 9.8,53.5 9.7,53.4
        </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
        <Placemark><name>Rail</name><LineString><coordinates>
          9.7,53.4 9.9,53.6
        </coordinates></LineString></Placemark>
      </Document></kml>`;
    expect(parseGisArea(kml, 'kml')).toHaveLength(1);
    const lines = parseGisLines(kml, 'kml');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.name).toBe('Rail');
  });

  it('drops degenerate lines and bad coordinates', () => {
    const geojson = JSON.stringify({
      type: 'GeometryCollection',
      geometries: [
        { type: 'LineString', coordinates: [[9.7, 53.4]] },
        { type: 'LineString', coordinates: [[9.7, 53.4], [999, 53.5], [9.9, 53.6]] },
      ],
    });
    const lines = parseGisLines(geojson, 'geojson');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.path).toHaveLength(2);
  });

  it('returns [] for unparseable input rather than throwing', () => {
    expect(parseGisLines('not json', 'geojson')).toEqual([]);
    expect(parseGisLines('<kml', 'kml')).toEqual([]);
  });
});

/**
 * Point-only exports: a utility publishes an overhead line as one Placemark
 * per pylon, with no LineString anywhere, and in arbitrary document order.
 */
describe('lines chained from bare points', () => {
  /** A straight run of `n` pylons ~350 m apart, emitted out of order. */
  function pylonKml(prefix: string, n: number, lat0: number, lng0: number, shuffle = true): string {
    const idx = Array.from({ length: n }, (_, i) => i);
    if (shuffle) idx.sort((a, b) => ((a * 7) % n) - ((b * 7) % n));
    const marks = idx
      .map((i) => `<Placemark><name>${prefix} ${i + 1}_337</name>` +
        `<Point><coordinates>${(lng0 + i * 0.005).toFixed(9)},${lat0.toFixed(9)},0</coordinates></Point></Placemark>`)
      .join('');
    return `<?xml version="1.0"?><kml><Document>${marks}</Document></kml>`;
  }

  it('recovers one ordered centreline from unordered pylons', () => {
    const lines = parseGisLines(pylonKml('Mast', 20, 53.52, 9.28), 'kml');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.path).toHaveLength(20);
    // Walking the recovered order must march monotonically along the run.
    const lngs = lines[0]!.path.map((p) => p.lng);
    const ascending = lngs.every((v, i) => i === 0 || v > lngs[i - 1]!);
    const descending = lngs.every((v, i) => i === 0 || v < lngs[i - 1]!);
    expect(ascending || descending).toBe(true);
  });

  it('splits runs that share a naming scheme but sit far apart', () => {
    const a = pylonKml('Mast', 8, 53.52, 9.28);
    const b = pylonKml('Mast', 8, 53.60, 9.90);
    const merged = a.replace('</Document></kml>', '') + b.replace(/^.*<Document>/, '');
    const lines = parseGisLines(merged, 'kml');
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.path.length === 8)).toBe(true);
  });

  it('leaves files that carry real lines alone', () => {
    const kml = `<?xml version="1.0"?><kml><Document>
      <Placemark><name>Road</name><LineString><coordinates>9.1,53.1,0 9.2,53.2,0</coordinates></LineString></Placemark>
      <Placemark><name>Marker 1</name><Point><coordinates>9.3,53.3,0</coordinates></Point></Placemark>
      <Placemark><name>Marker 2</name><Point><coordinates>9.31,53.31,0</coordinates></Point></Placemark>
    </Document></kml>`;
    const lines = parseGisLines(kml, 'kml');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.name).toBe('Road');
  });

  it('needs two points before it invents a line', () => {
    const kml = `<?xml version="1.0"?><kml><Document>
      <Placemark><name>Solo</name><Point><coordinates>9.3,53.3,0</coordinates></Point></Placemark>
    </Document></kml>`;
    expect(parseGisLines(kml, 'kml')).toEqual([]);
  });

  it('chains GeoJSON point features the same way', () => {
    const features = Array.from({ length: 6 }, (_, i) => ({
      type: 'Feature',
      properties: { name: `Mast ${i + 1}_337` },
      geometry: { type: 'Point', coordinates: [9.28 + ((i * 5) % 6) * 0.005, 53.52] },
    }));
    const lines = parseGisLines(JSON.stringify({ type: 'FeatureCollection', features }), 'geojson');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.path).toHaveLength(6);
  });
});
